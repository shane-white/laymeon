"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DocumentListItem } from "@/components/documents/document-list-item";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import { AddProjectDialog } from "@/components/documents/add-project-dialog";
import { useDocuments, type Document } from "@/hooks/use-documents";
import { FileText, Lightbulb, Plus, Upload } from "lucide-react";

interface DocumentSidebarProps {
  selectedDocId: string | null;
  onSelectDoc: (id: string) => void;
}

const SECTIONS = [
  { type: "resume", title: "Resumes", label: "Resume" },
  { type: "cover_letter", title: "Cover Letters", label: "Cover Letter" },
  { type: "project", title: "Example Works", label: "Project" },
] as const;

/** The dialog that adds a document of `type`, opened by `children`. */
function AddDocumentDialog({
  type,
  children,
}: {
  type: (typeof SECTIONS)[number]["type"];
  children: React.ReactNode;
}) {
  return type === "project" ? (
    <AddProjectDialog>{children}</AddProjectDialog>
  ) : (
    <UploadDocumentDialog documentType={type}>{children}</UploadDocumentDialog>
  );
}

/** Default first, then newest first (the API already returns newest first). */
function sortDocuments(docs: Document[]): Document[] {
  return [...docs].sort((a, b) => Number(b.is_default) - Number(a.is_default));
}

export function DocumentSidebar({
  selectedDocId,
  onSelectDoc,
}: DocumentSidebarProps) {
  const { data: documents, isLoading } = useDocuments();

  // Projects can be written in the app as well as uploaded.
  const uploaded = documents?.filter((d) => d.source !== "generated") ?? [];
  const generated = documents?.filter((d) => d.source === "generated") ?? [];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-w-0 flex-col border-r">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <FileText className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Documents</h2>
        </div>
        {/* Radix wraps content in a display:table div that grows to fit the
            longest name; make it a block so rows truncate at the panel width. */}
        <ScrollArea className="h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
          <div className="p-3">
            {SECTIONS.map(({ type, title, label }) => {
              const verb = type === "project" ? "Add" : "Upload";
              const docs = sortDocuments(
                uploaded.filter((d) => d.document_type === type),
              );
              return (
                <section key={type} className="mb-4">
                  <div className="mb-1 flex items-center justify-between px-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {title}
                    </p>
                    {docs.length > 0 && (
                      <AddDocumentDialog type={type}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          aria-label={`${verb} ${label}`}
                          title={`${verb} ${label}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </AddDocumentDialog>
                    )}
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : docs.length === 0 ? (
                    <AddDocumentDialog type={type}>
                      <button className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                        {type === "project" ? (
                          <Lightbulb className="h-4 w-4 shrink-0" />
                        ) : (
                          <Upload className="h-4 w-4 shrink-0" />
                        )}
                        <span>
                          {verb} {label}
                        </span>
                      </button>
                    </AddDocumentDialog>
                  ) : (
                    <div className="space-y-1">
                      {docs.map((doc) => (
                        <DocumentListItem
                          key={doc.id}
                          document={doc}
                          isSelected={doc.id === selectedDocId}
                          onSelect={onSelectDoc}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}

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
                      {doc.display_name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
