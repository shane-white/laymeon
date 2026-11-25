/** What any API route needs: the signed-in user, the 401 to send without one, and a checked JSON body. */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** The request's Supabase client and signed-in user (null when signed out). */
export async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/** The request's JSON body, checked against the schema, or the 400 response to send instead. */
export async function requestBody<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
): Promise<{ ok: true; body: T } | { ok: false; response: NextResponse }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid request body" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, response: NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 }) };
  }
  return { ok: true, body: parsed.data };
}
