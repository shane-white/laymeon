"use client";

import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyPrompt, downloadName, tailoredMarkdown } from "@/lib/tailoring/outputs";
import type { Tailoring } from "@/lib/tailoring/tailoring";
import { acceptedCount } from "./view";

interface TailoringOutputsProps {
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

/**
 * What the user takes away from the Tailoring, using only accepted
 * Suggestions: a prompt for another AI to make the edits to the original
 * file, or the Resume with the edits made, as Markdown to download.
 */
export function TailoringOutputs({ tailoring, resumeName, company }: TailoringOutputsProps) {
  const { accepted } = acceptedCount(tailoring.items);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyPrompt(tailoring));
      toast.success(
        accepted === 0
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
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={copy}
        title="Copy a prompt that tells another AI to make your accepted edits to your original file"
      >
        <Copy /> Copy prompt
      </Button>
      <Button variant="outline" size="sm" onClick={download} title="Download your Resume with the accepted edits, as Markdown">
        <Download /> Download Markdown
      </Button>
    </div>
  );
}
