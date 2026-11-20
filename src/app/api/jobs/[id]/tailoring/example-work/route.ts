import { createClient } from "@/lib/supabase/server";
import { tailoringDeps } from "@/lib/tailoring/deps";
import { exampleWorkRequestSchema, tailoringResponse } from "@/lib/tailoring/http";
import { fillGap } from "@/lib/tailoring/lifecycle";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

// Writing the Suggestion is a Claude step, and adding the Example Work
// rebuilds the Career Story in the background after the response is sent;
// both count toward this limit.
export const maxDuration = 300;

/**
 * Fills a gap in the Job's Tailoring: adds the user's written Example Work and
 * writes the item's Suggestion from it. The JSON body is
 * `{ itemId, title, description }` (see `exampleWorkRequestSchema`); the
 * response is the Tailoring, as for GET `/api/jobs/[id]/tailoring`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = exampleWorkRequestSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });

  const { itemId, title, description } = parsed.data;
  return tailoringResponse(await fillGap(tailoringDeps(supabase, user.id), id, itemId, { title, description }));
}
