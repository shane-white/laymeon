import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ChangeError, deleteChange, resolveChange } from "@/lib/profile/user-changes";
import { NextResponse, type NextRequest } from "next/server";

const resolveSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("keep_mine"), field: z.string().min(1).max(50) }),
  z.object({ action: z.literal("reset_field"), field: z.string().min(1).max(50) }),
  z.object({ action: z.literal("keep_item") }),
]);

function errorResponse(err: unknown) {
  if (err instanceof ChangeError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Answers a review item or resets one edited field. Returns the updated profile. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = resolveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }

  try {
    const { id } = await params;
    return NextResponse.json({ profile: await resolveChange(supabase, user.id, id, parsed.data) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Undoes a change: restores, resets, deletes an added item or splits a merge. Returns the updated profile. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    return NextResponse.json({ profile: await deleteChange(supabase, user.id, id) });
  } catch (err) {
    return errorResponse(err);
  }
}
