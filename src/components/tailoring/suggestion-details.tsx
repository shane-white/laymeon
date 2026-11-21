"use client";

import { useState, type ReactNode } from "react";
import { BookUser, Check, FileText, Lightbulb, PenLine, Pencil, SkipForward, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MAX_DECISION_TEXT_LENGTH,
  type Decision,
  type Suggestion,
  type SuggestionEvidence,
  type TailoringItem,
  type TailoringTarget,
} from "@/lib/tailoring/tailoring";
import { allowedDecisions, plainText } from "./view";

const STATUS_LABEL: Record<Decision["status"], string> = {
  undecided: "Not decided yet",
  accepted: "Accepted",
  edited: "Accepted with your edits",
  own_text: "Accepted with your own text",
  rejected: "Rejected",
  skipped: "Skipped",
};

const MISSING = "bg-red-500/15 text-red-700 dark:text-red-400";
const PARTIAL = "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";

function StatusBadge({ label, className }: { label: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-none", className)}>
      {label}
    </Badge>
  );
}

function TargetBadges({ target }: { target: TailoringTarget }) {
  if (target.kind === "screener") return <StatusBadge label="Screener not shown" className={MISSING} />;
  return (
    <>
      <StatusBadge label={target.importance === "must_have" ? "Must-have" : "Nice-to-have"} className="bg-muted" />
      <StatusBadge
        label={target.match === "missing" ? "Missing" : "Partial"}
        className={target.match === "missing" ? MISSING : PARTIAL}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
      {children}
    </div>
  );
}

function CurrentText({ suggestion }: { suggestion: Suggestion }) {
  if (suggestion.kind === "rewrite") {
    return (
      <Field label="Current text">
        <p className="rounded-md bg-yellow-400/20 px-2 py-1 text-sm">{plainText(suggestion.quote)}</p>
      </Field>
    );
  }
  return (
    <Field label="Where it goes">
      <p className="text-sm">
        {suggestion.anchor.type === "after" ? (
          <>
            New text after <q className="italic">{plainText(suggestion.anchor.quote)}</q>
          </>
        ) : (
          <>
            New text at the end of <span className="font-medium">{suggestion.anchor.heading}</span>
          </>
        )}
      </p>
    </Field>
  );
}

function EvidenceList({ evidence }: { evidence: SuggestionEvidence[] }) {
  if (evidence.length === 0) return null;
  return (
    <Field label="Evidence">
      <ul className="flex flex-col gap-2 text-sm">
        {evidence.map((e, i) => (
          <li key={i} className="flex flex-col gap-1">
            {e.source === "career_story" && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <BookUser className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  In your Career Story: <span className="font-medium">{e.label}</span>
                </span>
                {e.quotes.map((q, j) => (
                  <blockquote key={j} className="border-l-2 pl-2 text-xs text-muted-foreground">
                    &ldquo;{q.quote}&rdquo;
                    {q.documentName && <span className="not-italic"> — {q.documentName}</span>}
                  </blockquote>
                ))}
              </>
            )}
            {e.source === "resume" && (
              <span className="inline-flex items-start gap-1.5">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>
                  Rewords your Resume: <q className="italic">{plainText(e.quote)}</q>
                </span>
              </span>
            )}
            {e.source === "example_work" && (
              <span className="inline-flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                From your Example Work: <span className="font-medium">{e.title}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Field>
  );
}

/** Writing the text for an edited or own-text decision. */
function TextEditor({
  initial,
  label,
  onSave,
  onCancel,
}: {
  initial: string;
  label: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSave(text.trim());
      }}
    >
      <Textarea
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_DECISION_TEXT_LENGTH}
        autoFocus
        className="min-h-24"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!text.trim()}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Props for the gap's Example Work prompt in the details panel. */
export interface GapPromptProps {
  item: TailoringItem;
}

interface SuggestionDetailsProps {
  item: TailoringItem;
  number: number;
  total: number;
  onDecide: (decision: Decision) => void;
  /** The Example Work prompt for a gap. */
  gapPrompt: (props: GapPromptProps) => ReactNode;
}

/**
 * The selected item: what it's aimed at, its Suggestion (current text,
 * proposed text, why and Evidence) with the decisions it allows, and the
 * Example Work prompt for a gap. A decision can be changed or undone.
 */
export function SuggestionDetails({ item, number, total, onDecide, gapPrompt }: SuggestionDetailsProps) {
  const [editing, setEditing] = useState<"edited" | "own_text" | null>(null);
  const { suggestion, decision } = item;
  const allowed = allowedDecisions(item);
  const decidedText = decision.status === "edited" || decision.status === "own_text" ? decision.text : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {number} of {total}
          </span>
          <TargetBadges target={item.target} />
        </div>
        <h3 className="text-sm font-semibold">{item.target.text}</h3>
      </div>

      {suggestion && (
        <div className="flex flex-col gap-3">
          <CurrentText suggestion={suggestion} />
          <Field label={decidedText !== null ? "Your text" : "Proposed text"}>
            <p className="rounded-md bg-green-500/10 px-2 py-1 text-sm whitespace-pre-line">
              {plainText(decidedText ?? suggestion.text)}
            </p>
          </Field>
          <Field label="Why">
            <p className="text-sm">{suggestion.why}</p>
          </Field>
          <EvidenceList evidence={suggestion.evidence} />
        </div>
      )}

      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {STATUS_LABEL[decision.status]}
        </p>
        {editing ? (
          <TextEditor
            key={editing}
            label={editing === "edited" ? "Edit the proposed text" : "Write your own text"}
            initial={editing === "edited" ? (decidedText ?? suggestion?.text ?? "") : decision.status === "own_text" ? decision.text : ""}
            onSave={(text) => {
              onDecide({ status: editing, text });
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {allowed.includes("accepted") && (
              <Button size="sm" disabled={decision.status === "accepted"} onClick={() => onDecide({ status: "accepted" })}>
                <Check /> Accept
              </Button>
            )}
            {allowed.includes("edited") && (
              <Button size="sm" variant="outline" onClick={() => setEditing("edited")}>
                <Pencil /> Edit
              </Button>
            )}
            {allowed.includes("own_text") && (
              <Button size="sm" variant="outline" onClick={() => setEditing("own_text")}>
                <PenLine /> Write my own
              </Button>
            )}
            {allowed.includes("rejected") && (
              <Button
                size="sm"
                variant="outline"
                disabled={decision.status === "rejected"}
                onClick={() => onDecide({ status: "rejected" })}
              >
                <X /> Reject
              </Button>
            )}
            {allowed.includes("skipped") && (
              <Button
                size="sm"
                variant="outline"
                disabled={decision.status === "skipped"}
                onClick={() => onDecide({ status: "skipped" })}
              >
                <SkipForward /> Skip
              </Button>
            )}
            {decision.status !== "undecided" && (
              <Button size="sm" variant="ghost" onClick={() => onDecide({ status: "undecided" })}>
                <Undo2 /> Undo
              </Button>
            )}
          </div>
        )}
      </div>

      {item.gap && decision.status !== "skipped" && (
        <div className="flex flex-col gap-2 border-t pt-3">
          {suggestion && (
            <p className="text-xs text-muted-foreground">Or, to show more than your Resume says:</p>
          )}
          {gapPrompt({ item })}
        </div>
      )}
    </div>
  );
}
