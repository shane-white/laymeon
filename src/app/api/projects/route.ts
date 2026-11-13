import { createClient } from "@/lib/supabase/server";
import { splitProjects } from "@/lib/ai/split-projects";
import {
  MAX_PROJECTS,
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_TITLE_LENGTH,
} from "@/lib/projects";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleRebuild } from "@/lib/profile/auto-rebuild";
import { NextResponse, type NextRequest } from "next/server";

// Changing a document rebuilds the Career Story in the background, after the
// response is sent; that work counts toward this limit.
export const maxDuration = 300;

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const LIMIT_MESSAGE = `You can keep up to ${MAX_PROJECTS} projects. Delete one to add another.`;

/**
 * Adds projects. A JSON body `{ title, description }` adds one written
 * project. A multipart body with a PDF or Word `file` splits it into projects
 * and adds each one. Returns the created documents.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count, error: countError } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("document_type", "project")
    .is("deleted_at", null);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const remaining = MAX_PROJECTS - (count ?? 0);
  if (remaining <= 0) {
    return NextResponse.json({ error: LIMIT_MESSAGE }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    return importProjects(supabase, user.id, request, remaining);
  }
  return addWrittenProject(supabase, user.id, request);
}

async function addWrittenProject(
  supabase: SupabaseClient,
  userId: string,
  request: NextRequest,
) {
  let body: { title?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";

  if (!title) {
    return NextResponse.json({ error: "Give the project a title" }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "Describe the project" }, { status: 400 });
  }
  if (title.length > MAX_PROJECT_TITLE_LENGTH) {
    return NextResponse.json(
      { error: `Titles can be up to ${MAX_PROJECT_TITLE_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (description.length > MAX_PROJECT_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      { error: `Descriptions can be up to ${MAX_PROJECT_DESCRIPTION_LENGTH.toLocaleString()} characters` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      document_type: "project",
      source: "written",
      display_name: title,
      parsed_markdown: description,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await scheduleRebuild(supabase, userId);
  return NextResponse.json([data], { status: 201 });
}

async function importProjects(
  supabase: SupabaseClient,
  userId: string,
  request: NextRequest,
  remaining: number,
) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a PDF or DOCX file." },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const projects = await splitProjects(buffer, file.type, file.name);

    if (projects.length === 0) {
      return NextResponse.json(
        { error: "We couldn't find any projects in that document." },
        { status: 422 },
      );
    }
    if (projects.length > remaining) {
      return NextResponse.json(
        {
          error: `That document has ${projects.length} projects, but you have room for ${remaining} more. You can keep up to ${MAX_PROJECTS}.`,
        },
        { status: 400 },
      );
    }

    const storagePath = `projects/${userId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("imported-documents")
      .upload(storagePath, buffer, { contentType: file.type });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data, error } = await supabase
      .from("documents")
      .insert(
        projects.map((p) => ({
          user_id: userId,
          document_type: "project",
          source: "uploaded",
          display_name: p.title,
          parsed_markdown: p.description,
          original_filename: file.name,
          mime_type: file.type,
          file_size_bytes: file.size,
          storage_bucket: "imported-documents",
          storage_path: storagePath,
        })),
      )
      .select();

    if (error) {
      throw new Error(`Database insert failed: ${error.message}`);
    }

    await scheduleRebuild(supabase, userId);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to import projects: ${message}` },
      { status: 500 },
    );
  }
}
