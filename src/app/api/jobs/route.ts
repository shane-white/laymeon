import { createClient } from "@/lib/supabase/server";
import { extractJobFromUrl, extractJobFromText } from "@/lib/ai/extract-job";
import { NextResponse, type NextRequest } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_job_listings")
    .select(
      `
      id,
      status,
      custom_job_title,
      custom_job_company,
      match_analysis,
      resume_suggestions,
      cover_letter_suggestions,
      interview_suggestions,
      notes,
      created_at,
      job_listing:job_listings (
        id,
        url,
        extracted_job_title,
        extracted_company_name,
        description
      )
    `,
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { url, text } = body as { url?: string; text?: string };

  if (!url && !text) {
    return NextResponse.json(
      { error: "Either url or text is required" },
      { status: 400 },
    );
  }

  try {
    const extracted = url
      ? await extractJobFromUrl(url)
      : await extractJobFromText(text!);

    // Insert the job listing
    const { data: jobListing, error: jobError } = await supabase
      .from("job_listings")
      .insert({
        url: url || null,
        extracted_job_title: extracted.title,
        extracted_company_name: extracted.company,
        description: extracted.description,
      })
      .select()
      .single();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }

    // Link to the user
    const { data: userJob, error: linkError } = await supabase
      .from("user_job_listings")
      .insert({
        user_id: user.id,
        job_listing_id: jobListing.id,
        status: "interested",
      })
      .select(
        `
        id,
        status,
        created_at,
        job_listing:job_listings (
          id,
          url,
          extracted_job_title,
          extracted_company_name,
          description
        )
      `,
      )
      .single();

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    return NextResponse.json(userJob, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to process job: ${message}` },
      { status: 500 },
    );
  }
}
