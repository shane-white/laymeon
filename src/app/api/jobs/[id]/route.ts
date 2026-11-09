import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const {
    status,
    custom_job_title,
    custom_job_company,
    notes,
    resume_document_id,
    cover_letter_document_id,
  } = body as {
    status?: string;
    custom_job_title?: string;
    custom_job_company?: string;
    notes?: string;
    resume_document_id?: string | null;
    cover_letter_document_id?: string | null;
  };

  if (status) {
    const validStatuses = ["interested", "applied", "interviewing", "closed"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
  }

  const updates: Record<string, string | null> = {};

  // A selected document must be one of this user's live uploads of that type.
  const selections = [
    ["resume_document_id", resume_document_id, "resume"],
    ["cover_letter_document_id", cover_letter_document_id, "cover_letter"],
  ] as const;
  for (const [field, docId, documentType] of selections) {
    if (docId === undefined) continue;
    if (docId === null) {
      updates[field] = null;
      continue;
    }
    if (typeof docId !== "string") {
      return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
    }
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("id", docId)
      .eq("user_id", user.id)
      .eq("document_type", documentType)
      .eq("source", "uploaded")
      .is("deleted_at", null)
      .maybeSingle();
    if (!doc) {
      return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
    }
    updates[field] = docId;
  }

  if (status) updates.status = status;
  if (custom_job_title !== undefined) updates.custom_job_title = custom_job_title;
  if (custom_job_company !== undefined) updates.custom_job_company = custom_job_company;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_job_listings")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Soft delete
  const { error } = await supabase
    .from("user_job_listings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
