"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

interface JobDescriptionTabProps {
  description: string | null;
}

export function JobDescriptionTab({ description }: JobDescriptionTabProps) {
  return (
    <ScrollArea className="h-0 flex-1">
      <div className="whitespace-pre-wrap px-6 py-4 text-sm leading-relaxed">
        {description || "No description available."}
      </div>
    </ScrollArea>
  );
}
