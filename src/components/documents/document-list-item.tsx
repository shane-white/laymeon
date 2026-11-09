"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EditDocumentDialog } from "@/components/documents/edit-document-dialog";
import {
  useDeleteDocument,
  useSetDefaultDocument,
  type Document,
} from "@/hooks/use-documents";
import { cn } from "@/lib/utils";
import { FileText, Loader2, MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface DocumentListItemProps {
  document: Document;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const typeLabels: Record<Document["document_type"], string> = {
  resume: "resume",
  cover_letter: "cover letter",
};

export function DocumentListItem({
  document,
  isSelected,
  onSelect,
}: DocumentListItemProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const setDefault = useSetDefaultDocument();
  const deleteDocument = useDeleteDocument();
  const typeLabel = typeLabels[document.document_type];

  function handleSetDefault() {
    setDefault.mutate(document.id, {
      onSuccess: () => toast.success(`"${document.display_name}" is now your default ${typeLabel}.`),
      onError: (err) => toast.error(err.message),
    });
  }

  function handleDelete() {
    deleteDocument.mutate(document.id, {
      onSuccess: () => {
        toast.success(`"${document.display_name}" deleted.`);
        setDeleteOpen(false);
      },
      onError: () => toast.error(`Failed to delete ${typeLabel}.`),
    });
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(document.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(document.id);
          }
        }}
        className={cn(
          "group flex min-w-0 items-start gap-2 rounded-md px-3 py-2 text-sm transition-colors",
          isSelected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <TruncatedText text={document.display_name} className="font-medium" />
            {document.is_default && (
              <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
                Default
              </Badge>
            )}
          </div>
          {document.target_role && (
            <TruncatedText
              text={document.target_role}
              className="text-xs text-muted-foreground"
            />
          )}
        </div>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Actions for ${document.display_name}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Edit details
            </DropdownMenuItem>
            {!document.is_default && (
              <DropdownMenuItem onSelect={handleSetDefault}>
                <Star className="h-4 w-4" />
                Set as default
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <EditDocumentDialog
        document={document}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {typeLabel}?</DialogTitle>
            <DialogDescription>
              &ldquo;{document.display_name}&rdquo; will be removed.
              {document.is_default &&
                ` This is your default ${typeLabel}. Your most recently uploaded ${typeLabel} will become the default, and jobs using the default will switch to it.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteDocument.isPending}
            >
              {deleteDocument.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TruncatedText({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("block min-w-0 truncate", className)}>{text}</span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs break-words">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
