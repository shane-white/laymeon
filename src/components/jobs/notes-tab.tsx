"use client";

import { useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Pencil, Save } from "lucide-react";
import { useUpdateNotes } from "@/hooks/use-jobs";
import { toast } from "sonner";

interface NotesTabProps {
  userJobId: string;
  content: string | null;
}

export function NotesTab({ userJobId, content }: NotesTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const updateNotes = useUpdateNotes();

  const editor = useEditor({
    extensions: [StarterKit],
    content: content || "",
    immediatelyRender: false,
    editable: isEditing,
  });

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    editor?.setEditable(true);
    editor?.commands.focus();
  }, [editor]);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    const html = editor.getHTML();
    try {
      await updateNotes.mutateAsync({ id: userJobId, notes: html });
      setIsEditing(false);
      editor.setEditable(false);
      toast.success("Notes saved.");
    } catch {
      toast.error("Failed to save notes.");
    }
  }, [editor, userJobId, updateNotes]);

  if (!editor) return null;

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="h-0 flex-1">
        <div className="prose prose-sm dark:prose-invert max-w-none px-6 py-4">
          <EditorContent editor={editor} />
        </div>
      </ScrollArea>
      <div className="border-t px-6 py-3">
        {isEditing ? (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateNotes.isPending}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={handleEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}
