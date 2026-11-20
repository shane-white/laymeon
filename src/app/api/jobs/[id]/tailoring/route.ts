import { createClient } from "@/lib/supabase/server";
import { tailoringDeps } from "@/lib/tailoring/deps";
import { decisionRequestSchema, tailoringResponse } from "@/lib/tailoring/http";
import { decide, getTailoring, startOver, startTailoring } from "@/lib/tailoring/lifecycle";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

// Starting a Tailoring runs Claude steps in a row, each of which can take a while.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/** The Job's Tailoring for its current Resume, whether it's an Earlier version, and whether one can start. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return unauthorized();
  const { id } = await params;
  return tailoringResponse(await getTailoring(tailoringDeps(supabase, user.id), id));
}

/**
 * Starts the Job's Tailoring, or returns the one it has. A JSON body
 * `{ startOver: true }` replaces it with a new one instead.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return unauthorized();
  const { id } = await params;

  let body: { startOver?: unknown } = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
  }

  const deps = tailoringDeps(supabase, user.id);
  return tailoringResponse(await (body?.startOver === true ? startOver(deps, id) : startTailoring(deps, id)));
}

/**
 * Saves the user's decision on one item of the Job's Tailoring. The JSON body
 * is `{ itemId, decision }` (see `decisionRequestSchema`); the response is the
 * Tailoring, as for GET.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { supabase, user } = await signedInUser();
  if (!user) return unauthorized();
  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = decisionRequestSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });

  const { itemId, decision } = parsed.data;
  return tailoringResponse(await decide(tailoringDeps(supabase, user.id), id, itemId, decision));
}
