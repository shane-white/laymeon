import { createClient } from "@/lib/supabase/server";
import { MAX_PROJECT_DESCRIPTION_LENGTH } from "@/lib/projects";
import { scheduleRebuild } from "@/lib/profile/auto-rebuild";
import { NextResponse, type NextRequest } from "next/server";

// Changing a document rebuilds the Career Story in the background, after the
// response is sent; that work counts toward this limit.
export const maxDuration = 300;

const MAX_LABEL_LENGTH = 200;
// Raised by set_default_document / delete_document when the row isn't visible.
const NOT_FOUND_CODE = "P0002";

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
  const body = (await request.json()) as {
    display_name?: unknown;
    target_role?: unknown;
    is_default?: unknown;
    parsed_markdown?: unknown;
  };

  const updates: {
    display_name?: string;
    target_role?: string | null;
    parsed_markdown?: string;
  } = {};

  if (body.display_name !== undefined) {
    if (typeof body.display_name !== "string" || !body.display_name.trim()) {
      return NextResponse.json(
        { error: "Name can't be empty" },
        { status: 400 },
      );
    }
    updates.display_name = body.display_name.trim().slice(0, MAX_LABEL_LENGTH);
  }

  if (body.target_role !== undefined) {
    if (body.target_role !== null && typeof body.target_role !== "string") {
      return NextResponse.json(
        { error: "Invalid target role" },
        { status: 400 },
      );
    }
    const role = body.target_role?.trim().slice(0, MAX_LABEL_LENGTH);
    updates.target_role = role || null;
  }

  // Only a project's content can be edited; resumes and cover letters keep
  // the content parsed from their file.
  if (body.parsed_markdown !== undefined) {
    if (typeof body.parsed_markdown !== "string" || !body.parsed_markdown.trim()) {
      return NextResponse.json(
        { error: "Description can't be empty" },
        { status: 400 },
      );
    }
    const content = body.parsed_markdown.trim();
    if (content.length > MAX_PROJECT_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: `Descriptions can be up to ${MAX_PROJECT_DESCRIPTION_LENGTH.toLocaleString()} characters` },
        { status: 400 },
      );
    }
    const { data: existing } = await supabase
      .from("documents")
      .select("document_type")
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (existing.document_type !== "project") {
      return NextResponse.json(
        { error: "Only a project's description can be edited" },
        { status: 400 },
      );
    }
    updates.parsed_markdown = content;
  }

  if (body.is_default !== undefined && body.is_default !== true) {
    return NextResponse.json(
      { error: "is_default can only be set to true; set another document as default instead" },
      { status: 400 },
    );
  }

  const setDefault = body.is_default === true;

  if (Object.keys(updates).length === 0 && !setDefault) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  if (Object.keys(updates).length > 0) {
    const { data, error } = await supabase
      .from("documents")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
  }

  if (setDefault) {
    const { error } = await supabase.rpc("set_default_document", {
      doc_id: id,
    });
    if (error) {
      const status = error.code === NOT_FOUND_CODE ? 404 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
  }

  const { data: doc, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A new name or target role shows in the Career Story too.
  await scheduleRebuild(supabase, user.id);
  return NextResponse.json(doc);
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

  const { error } = await supabase.rpc("delete_document", { doc_id: id });

  if (error) {
    const status = error.code === NOT_FOUND_CODE ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  await scheduleRebuild(supabase, user.id);
  return NextResponse.json({ success: true });
}
