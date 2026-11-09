"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateDocument, type Document } from "@/hooks/use-documents";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface EditDocumentDialogProps {
  document: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditDocumentDialog({
  document,
  open,
  onOpenChange,
}: EditDocumentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed so the form resets to the saved values each time it opens. */}
        {open && (
          <EditDocumentForm
            key={document.id}
            document={document}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDocumentForm({
  document,
  onDone,
}: {
  document: Document;
  onDone: () => void;
}) {
  const [name, setName] = useState(document.display_name);
  const [targetRole, setTargetRole] = useState(document.target_role ?? "");
  const updateDocument = useUpdateDocument();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await updateDocument.mutateAsync({
        id: document.id,
        display_name: name,
        target_role: targetRole,
      });
      toast.success("Document updated.");
      onDone();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update document.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Edit details</DialogTitle>
        <DialogDescription>
          The target role helps you pick the right version for each job.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="edit-document-name">Name</Label>
        <Input
          id="edit-document-name"
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-document-role">Target role (optional)</Label>
        <Input
          id="edit-document-role"
          value={targetRole}
          maxLength={200}
          placeholder="e.g. Product Manager"
          onChange={(e) => setTargetRole(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!name.trim() || updateDocument.isPending}
        >
          {updateDocument.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
