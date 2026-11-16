"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Document } from "@/hooks/use-documents";
import { ReviewResumeButton } from "@/components/resume-review/review-button";

interface DocumentViewerProps {
  document: Document | null;
  /** Opens a resume's review report. */
  onOpenReport: (resumeDocumentId: string) => void;
}

const typeLabels: Record<string, string> = {
  resume: "Resume",
  cover_letter: "Cover Letter",
  project: "Example Work",
};

export function DocumentViewer({ document, onOpenReport }: DocumentViewerProps) {
  if (!document) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <FileText className="h-10 w-10" />
        <p className="text-sm">Select a document to view</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-col gap-1 border-b px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">
              {document.display_name}
            </h1>
            {document.document_type === "project" &&
              document.original_filename && (
                <p className="truncate text-xs text-muted-foreground">
                  From {document.original_filename}
                </p>
              )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {document.document_type === "resume" && document.parsed_markdown && (
              <ReviewResumeButton resumeDocumentId={document.id} onOpenReport={onOpenReport} />
            )}
            <Badge variant="outline">{typeLabels[document.document_type]}</Badge>
          </div>
        </div>
      </div>
      <ScrollArea className="h-0 flex-1">
        <div className="px-6 py-4">
          {document.parsed_markdown ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{document.parsed_markdown}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Document is being processed...
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
