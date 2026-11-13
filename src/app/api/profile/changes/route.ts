import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { profileSectionSchema } from "@/lib/profile/schema";
import { ChangeError, makeChange } from "@/lib/profile/user-changes";
import { NextResponse, type NextRequest } from "next/server";

const key = z.string().min(1).max(300);

const requestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("edit"), section: profileSectionSchema, targetKey: key, fields: z.record(z.string(), z.unknown()) }),
  z.object({ kind: z.literal("add"), section: profileSectionSchema, fields: z.record(z.string(), z.unknown()) }),
  z.object({ kind: z.literal("hide"), section: profileSectionSchema, targetKey: key }),
  z.object({ kind: z.literal("merge"), section: profileSectionSchema, targetKey: key, mergedKeys: z.array(key).min(1).max(50) }),
]);

/** Saves a change to the user's Career Story (edit, add, remove or merge) and returns the updated profile. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }

  try {
    const profile = await makeChange(supabase, user.id, parsed.data);
    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof ChangeError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
