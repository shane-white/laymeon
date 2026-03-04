import { createClient } from "@/lib/supabase/server";
import { parseDocument } from "@/lib/ai/parse-document";
import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const documentType = formData.get("documentType") as string;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!["resume", "cover_letter"].includes(documentType)) {
    return NextResponse.json(
      { error: "Invalid document type" },
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error: "Unsupported file type. Please upload a PDF, DOCX, or DOC file.",
      },
      { status: 400 },
    );
  }

  try {
    // Soft-delete existing document in this slot
    await supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("document_type", documentType)
      .eq("source", "uploaded")
      .is("deleted_at", null);

    // Upload to Supabase Storage
    const folder = documentType === "resume" ? "resumes" : "cover-letters";
    const storagePath = `${folder}/${user.id}/${Date.now()}-${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("imported-documents")
      .upload(storagePath, buffer, { contentType: file.type });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Parse and convert to markdown
    const { markdown } = await parseDocument(buffer, file.type, file.name);

    // Insert document record
    const { data: doc, error: dbError } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        document_type: documentType,
        source: "uploaded",
        original_filename: file.name,
        mime_type: file.type,
        file_size_bytes: file.size,
        storage_bucket: "imported-documents",
        storage_path: storagePath,
        parsed_markdown: markdown,
      })
      .select()
      .single();

    if (dbError) {
      throw new Error(`Database insert failed: ${dbError.message}`);
    }

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to upload document: ${message}` },
      { status: 500 },
    );
  }
}
