import { createClient } from "@/lib/supabase/server";
import { documentDeps } from "@/lib/documents/deps";
import { failure } from "@/lib/documents/document";
import { documentResponse } from "@/lib/documents/http";
import { replaceFile } from "@/lib/documents/lifecycle";
import { NextResponse, type NextRequest } from "next/server";

// Reading the new file, plus the Career Story Rebuild after the response is sent.
export const maxDuration = 300;

/** Replaces an uploaded Resume's or Cover letter's file. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return documentResponse(failure("invalid", "Invalid request body"));
  }
  const file = formData.get("file");
  const result = await replaceFile(documentDeps(supabase, user.id), id, { file: file instanceof File ? file : null });
  return documentResponse(result);
}
