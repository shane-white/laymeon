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
import { useDocuments } from "@/hooks/use-documents";

export default function DocumentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedDocId = searchParams.get("id");

  const { data: documents } = useDocuments();

  const selectedDoc = documents?.find((d) => d.id === selectedDocId) ?? null;

  function handleSelectDoc(docId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("id", docId);
    router.push(`/documents?${params.toString()}`);
  }

  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%">
        <DocumentSidebar
          selectedDocId={selectedDocId}
          onSelectDoc={handleSelectDoc}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="55%">
        <DocumentViewer document={selectedDoc} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="25%" minSize="15%" maxSize="35%">
        <DocumentChatPlaceholder />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
