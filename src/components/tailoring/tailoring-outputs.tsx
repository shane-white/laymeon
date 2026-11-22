"use client";

import type { ReactNode } from "react";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyPrompt, downloadName, outputEditCounts, tailoredMarkdown } from "@/lib/tailoring/outputs";
import type { Tailoring } from "@/lib/tailoring/tailoring";
import { plural } from "@/lib/utils";
import { acceptedCount } from "./view";

/** What the view gives the outputs menu: the button that opens it, and the side it opens on. */
export interface OutputsMenuProps {
  side: "top" | "bottom";
  children: ReactNode;
}

interface TailoringOutputsProps extends OutputsMenuProps {
  tailoring: Tailoring;
  resumeName: string | null;
  company: string | null;
}

/** Hands the browser a file to save. */
function saveFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

interface OutputProps {
  icon: ReactNode;
  title: string;
  description: string;
  onSelect: () => void;
}

function Output({ icon, title, description, onSelect }: OutputProps) {
  return (
    <DropdownMenuItem className="items-start py-2" onSelect={onSelect}>
      <span className="mt-0.5">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </DropdownMenuItem>
  );
}

/**
 * What the user takes away from the Tailoring, using only accepted
 * Suggestions: a prompt for another AI to make the edits to the original
 * file, or the Resume with the edits made, as Markdown to download. A menu
 * opened by `children`, the button the view gives it.
 */
export function TailoringOutputs({ tailoring, resumeName, company, side, children }: TailoringOutputsProps) {
  const { accepted } = acceptedCount(tailoring.items);
  const { promptEdits, downloadEdits } = outputEditCounts(tailoring);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyPrompt(tailoring));
      toast.success(
        promptEdits === 0
          ? "Prompt copied, but it has no edits yet. Accept a Suggestion to add one."
          : "Prompt copied. Paste it into an AI assistant along with your original resume file.",
      );
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  }

  function download() {
    saveFile(downloadName(resumeName, company), tailoredMarkdown(tailoring), "text/markdown;charset=utf-8");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {accepted === 0
            ? "You haven't accepted a Suggestion yet"
            : `Uses your ${plural(accepted, "accepted Suggestion")}`}
        </DropdownMenuLabel>
        <Output
          icon={<Copy />}
          title="Copy prompt"
          description={`For another AI to make these edits to your original file, keeping its formatting. ${plural(promptEdits, "edit")}.`}
          onSelect={() => void copy()}
        />
        <Output
          icon={<Download />}
          title="Download Markdown"
          description={`Your Resume with the edits made, as a .md file. ${plural(downloadEdits, "edit")}.`}
          onSelect={download}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
