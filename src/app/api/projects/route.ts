import { createClient } from "@/lib/supabase/server";
import { documentDeps } from "@/lib/documents/deps";
import { failure } from "@/lib/documents/document";
import { documentResponse } from "@/lib/documents/http";
import { addWrittenExampleWork, importExampleWorks } from "@/lib/documents/lifecycle";
import { NextResponse, type NextRequest } from "next/server";

// Changing a document rebuilds the Career Story in the background, after the
// response is sent; that work counts toward this limit.
export const maxDuration = 300;

/**
 * Adds Example Works. A JSON body `{ title, description }` adds one written
 * Example Work. A multipart body with a PDF or Word `file` splits it into
 * Example Works and adds each one.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deps = documentDeps(supabase, user.id);
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    let file: FormDataEntryValue | null;
    try {
      file = (await request.formData()).get("file");
    } catch {
      return documentResponse(failure("invalid", "Invalid request body"));
    }
    return documentResponse(await importExampleWorks(deps, { file: file instanceof File ? file : null }), 201);
  }

  let body: { title?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return documentResponse(failure("invalid", "Invalid request body"));
  }
  return documentResponse(await addWrittenExampleWork(deps, { title: body?.title, description: body?.description }), 201);
}
