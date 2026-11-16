import { createClient } from "@/lib/supabase/server";
import { parseDocument } from "@/lib/ai/parse-document";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, storagePathFor, UPLOAD_BUCKET } from "@/lib/documents/files";
import { scheduleRebuild } from "@/lib/profile/auto-rebuild";
import { NextResponse, type NextRequest } from "next/server";

// Parsing the new file, plus the Career Story rebuild after the response is sent.
export const maxDuration = 300;

interface DocumentRow {
  id: string;
  document_type: string;
  source: string;
  storage_bucket: string | null;
  storage_path: string | null;
}

/**
 * Replaces an uploaded resume's or cover letter's file (LAY-72). The document
 * keeps its ID, so its name, target role, default setting and the jobs that
 * use it stay the same. Its reviews become out of date, because the stored
 * file and text change.
 *
 * Order matters: the new file is parsed first, so a file that can't be read
 * changes nothing; the old file is only removed once the document points at
 * the new one.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: doc, error: loadError } = await supabase
    .from("documents")
    .select("id, document_type, source, storage_bucket, storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle<DocumentRow>();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (doc.source !== "uploaded" || (doc.document_type !== "resume" && doc.document_type !== "cover_letter")) {
    return NextResponse.json({ error: "Only uploaded resumes and cover letters can have their file replaced" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type. Please upload a PDF, DOCX, or DOC file." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is too large. Maximum size is 10 MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let markdown: string;
  try {
    ({ markdown } = await parseDocument(buffer, file.type, file.name));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Couldn't read the new file: ${message}` }, { status: 400 });
  }

  const storagePath = storagePathFor(doc.document_type, user.id, file.name);
  const { error: uploadError } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type });
  if (uploadError) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("documents")
    .update({
      storage_bucket: UPLOAD_BUCKET,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      parsed_markdown: markdown,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (updateError || !updated) {
    // Leave the document as it was, and don't keep the new file.
    await supabase.storage.from(UPLOAD_BUCKET).remove([storagePath]);
    if (!updated && !updateError) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    return NextResponse.json({ error: `Couldn't save the new file: ${updateError?.message}` }, { status: 500 });
  }

  if (doc.storage_bucket && doc.storage_path && doc.storage_path !== storagePath) {
    const { error: removeError } = await supabase.storage.from(doc.storage_bucket).remove([doc.storage_path]);
    // The document already uses the new file; an old file left behind only costs storage.
    if (removeError) console.error(`Couldn't remove the replaced file ${doc.storage_path}`, removeError);
  }

  // The Career Story re-extracts the document because its text changed.
  await scheduleRebuild(supabase, user.id);
  return NextResponse.json(updated);
}
