"use client";

import type { ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { useReorderJob, type UserJob } from "@/hooks/use-jobs";
import { displayTitle } from "@/lib/jobs/display";
import { neighborsAfterMove, positionBetween } from "@/lib/jobs/sort-order";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

export interface DragHandleProps {
  handle: ReactNode;
  isDragging: boolean;
}

interface SortableJobListProps {
  /** The jobs currently shown. Hidden jobs aren't moved. */
  jobs: UserJob[];
  renderItem: (job: UserJob, drag: DragHandleProps) => ReactNode;
}

export function SortableJobList({ jobs, renderItem }: SortableJobListProps) {
  const reorderJob = useReorderJob();

  const sensors = useSensors(
    // A short distance or press delay keeps clicks and scrolling working.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const titleOf = (id: string | number) => {
    const job = jobs.find((j) => j.id === id);
    return job ? displayTitle(job) : "job";
  };
  const positionOf = (id: string | number) =>
    jobs.findIndex((j) => j.id === id) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${titleOf(active.id)}, position ${positionOf(active.id)} of ${jobs.length}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} moved to position ${positionOf(over.id)} of ${jobs.length}.`
        : `${titleOf(active.id)} is no longer over the list.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} dropped at position ${positionOf(over.id)} of ${jobs.length}.`
        : `${titleOf(active.id)} dropped.`,
    onDragCancel: ({ active }) =>
      `Moving ${titleOf(active.id)} was cancelled. It is back at position ${positionOf(active.id)}.`,
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const fromIndex = jobs.findIndex((j) => j.id === active.id);
    const toIndex = jobs.findIndex((j) => j.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;

    const { above, below } = neighborsAfterMove(jobs, fromIndex, toIndex);
    const aboveOrder = above?.sort_order ?? null;
    const belowOrder = below?.sort_order ?? null;
    // When the gap is too small the server respaces; show the midpoint until then.
    const optimisticSortOrder =
      positionBetween(aboveOrder, belowOrder) ?? (aboveOrder! + belowOrder!) / 2;

    reorderJob.mutate(
      {
        id: String(active.id),
        aboveId: above?.id ?? null,
        belowId: below?.id ?? null,
        optimisticSortOrder,
      },
      { onError: () => toast.error("Couldn't save the new order.") },
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To reorder, press Space. Use the up and down arrow keys to move the job. Press Space again to drop it, or Escape to cancel.",
        },
      }}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={jobs.map((j) => j.id)} strategy={verticalListSortingStrategy}>
        {jobs.map((job) => (
          <SortableItem key={job.id} job={job} renderItem={renderItem} />
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  job,
  renderItem,
}: {
  job: UserJob;
  renderItem: SortableJobListProps["renderItem"];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: job.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "relative z-10" : undefined}
    >
      {renderItem(job, {
        isDragging,
        handle: (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${displayTitle(job)}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              listeners?.onKeyDown?.(e);
              // Space and Enter belong to the handle, not the row's select action.
              e.stopPropagation();
            }}
            className={cn(
              "flex w-5 shrink-0 cursor-grab touch-none items-start justify-center rounded pt-0.5 text-muted-foreground transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
              "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
              isDragging && "opacity-100",
            )}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ),
      })}
    </div>
  );
}
