"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentSlot } from "@/components/documents/document-slot";
import { useDocuments } from "@/hooks/use-documents";
import { FileText } from "lucide-react";

interface DocumentSidebarProps {
  selectedDocId: string | null;
  onSelectDoc: (id: string) => void;
}

export function DocumentSidebar({
  selectedDocId,
  onSelectDoc,
}: DocumentSidebarProps) {
  const { data: documents, isLoading } = useDocuments();

  const uploaded = documents?.filter((d) => d.source === "uploaded") ?? [];
  const generated = documents?.filter((d) => d.source === "generated") ?? [];

  const resume = uploaded.find((d) => d.document_type === "resume") ?? null;
  const coverLetter =
    uploaded.find((d) => d.document_type === "cover_letter") ?? null;

  return (
    <div className="flex h-full min-w-0 flex-col border-r">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <FileText className="h-4 w-4" />
        <h2 className="text-sm font-semibold">Documents</h2>
      </div>
      <ScrollArea className="h-0 flex-1">
        <div className="p-3">
          <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">
            Uploaded Documents
          </p>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="space-y-1">
              <DocumentSlot
                type="resume"
                document={resume}
                isSelected={resume?.id === selectedDocId}
                onSelect={onSelectDoc}
              />
              <DocumentSlot
                type="cover_letter"
                document={coverLetter}
                isSelected={coverLetter?.id === selectedDocId}
                onSelect={onSelectDoc}
              />
            </div>
          )}

          <Separator className="my-3" />

          <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">
            Generated Documents
          </p>
          {generated.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">
              No generated documents yet
            </p>
          ) : (
            <div className="space-y-1">
              {generated.map((doc) => (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectDoc(doc.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectDoc(doc.id);
                    }
                  }}
                  className={`flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    doc.id === selectedDocId
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {doc.original_filename}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
