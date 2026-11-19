import { createClient } from "@/lib/supabase/server";
import { documentDeps } from "@/lib/documents/deps";
import { failure } from "@/lib/documents/document";
import { documentResponse } from "@/lib/documents/http";
import { addUploadedDocument } from "@/lib/documents/lifecycle";
import { NextResponse, type NextRequest } from "next/server";

// Changing a document rebuilds the Career Story in the background, after the
// response is sent; that work counts toward this limit.
export const maxDuration = 300;

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

/** Adds an uploaded Resume or Cover letter. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return documentResponse(failure("invalid", "Invalid request body"));
  }
  const file = formData.get("file");
  const result = await addUploadedDocument(documentDeps(supabase, user.id), {
    file: file instanceof File ? file : null,
    documentType: formData.get("documentType"),
    displayName: formData.get("displayName"),
    targetRole: formData.get("targetRole"),
  });
  return documentResponse(result, 201);
}
