"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollArea } from "@/components/ui/scroll-area";

interface JobDescriptionTabProps {
  description: string | null;
}

export function JobDescriptionTab({ description }: JobDescriptionTabProps) {
  return (
    <ScrollArea className="h-0 flex-1">
      <div className="px-6 py-4">
        {description ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No description available.</p>
        )}
      </div>
    </ScrollArea>
  );
}
