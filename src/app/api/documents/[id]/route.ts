import { createClient } from "@/lib/supabase/server";
import { documentDeps } from "@/lib/documents/deps";
import { failure } from "@/lib/documents/document";
import { documentResponse } from "@/lib/documents/http";
import { deleteDocument, editDocument, setDefaultDocument } from "@/lib/documents/lifecycle";
import { NextResponse, type NextRequest } from "next/server";

// A change to Source material rebuilds the Career Story in the background,
// after the response is sent; that work counts toward this limit.
export const maxDuration = 300;

/**
 * `{ is_default: true }` sets the Default document. Otherwise edits
 * `display_name`, `target_role` and (for an Example Work) `parsed_markdown`.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return documentResponse(failure("invalid", "Invalid request body"));
  }
  if (typeof body !== "object" || body === null) return documentResponse(failure("invalid", "Invalid request body"));

  const deps = documentDeps(supabase, user.id);
  if (body.is_default !== undefined) {
    if (body.is_default !== true || Object.keys(body).length > 1) {
      return documentResponse(
        failure("invalid", "is_default can only be set to true, on its own; set another document as default instead"),
      );
    }
    return documentResponse(await setDefaultDocument(deps, id));
  }

  const result = await editDocument(deps, id, {
    displayName: body.display_name,
    targetRole: body.target_role,
    parsedMarkdown: body.parsed_markdown,
  });
  return documentResponse(result);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  return documentResponse(await deleteDocument(documentDeps(supabase, user.id), id));
}
