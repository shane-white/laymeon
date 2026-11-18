"use client";

import { useSearchParams, useRouter } from "next/navigation";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { DocumentSidebar } from "@/components/documents/document-sidebar";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { DocumentChatPlaceholder } from "@/components/documents/document-chat-placeholder";
import { ResumeReviewDeck } from "@/components/resume-review/review-deck";
import { useDocuments } from "@/hooks/use-documents";

export default function DocumentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedDocId = searchParams.get("id");
  // ?report=<resume id> shows that resume's review instead of a document.
  const selectedReportId = searchParams.get("report");

  const { data: documents } = useDocuments();

  const selectedDoc = documents?.find((d) => d.id === selectedDocId) ?? null;
  const reportResume = documents?.find((d) => d.id === selectedReportId) ?? null;

  function navigate(param: "id" | "report", value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("id");
    params.delete("report");
    if (value) params.set(param, value);
    const query = params.toString();
    router.push(query ? `/documents?${query}` : "/documents");
  }

  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%">
        <DocumentSidebar
          selectedDocId={selectedReportId ? null : selectedDocId}
          onSelectDoc={(id) => navigate("id", id)}
          selectedReportId={selectedReportId}
          onSelectReport={(id) => navigate("report", id)}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="55%">
        {selectedReportId ? (
          <ResumeReviewDeck
            key={selectedReportId}
            resumeDocumentId={selectedReportId}
            resume={reportResume}
            onDeleted={() => navigate("report", null)}
          />
        ) : (
          <DocumentViewer document={selectedDoc} onOpenReport={(id) => navigate("report", id)} />
        )}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="25%" minSize="15%" maxSize="35%">
        <DocumentChatPlaceholder />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
