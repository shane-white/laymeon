import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import type { UIMessage } from "ai";

export async function GET(
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

  const { data: latest, error: latestError } = await supabase
    .from("job_chat_messages")
    .select("conversation_id")
    .eq("user_job_id", id)
    .eq("user_id", user.id)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    return NextResponse.json({ error: latestError.message }, { status: 500 });
  }
  if (!latest) {
    return NextResponse.json({ conversationId: null, messages: [] });
  }

  const { data: rows, error } = await supabase
    .from("job_chat_messages")
    .select("message")
    .eq("conversation_id", latest.conversation_id)
    .eq("user_id", user.id)
    .order("seq", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    conversationId: latest.conversation_id as string,
    messages: rows.map((r) => r.message as UIMessage),
  });
}
