import { createClient } from "@/lib/supabase/server";
import { extractJobFromUrl } from "@/lib/ai/extract-job";
import { toJobListingRow } from "@/lib/jobs/listing";
import { NextResponse, type NextRequest } from "next/server";

// Scrapes a job's URL again and points the user's job at a new listing with
// the result. Listings can be shared, so we don't edit the old one. The
// user's status, notes, chat, custom title/company and analyses are kept.
export async function POST(
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

  const { data: userJob } = await supabase
    .from("user_job_listings")
    .select("id, job_listing:job_listings (url)")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!userJob) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Untyped client: the joined listing may be typed as an array.
  const listing = Array.isArray(userJob.job_listing)
    ? userJob.job_listing[0]
    : userJob.job_listing;
  const url: string | null | undefined = listing?.url;
  if (!url) {
    return NextResponse.json(
      { error: "This job wasn't added from a URL" },
      { status: 400 },
    );
  }

  try {
    const extracted = await extractJobFromUrl(url);

    const { data: jobListing, error: listingError } = await supabase
      .from("job_listings")
      .insert(toJobListingRow(url, extracted))
      .select("id")
      .single();

    if (listingError) {
      return NextResponse.json({ error: listingError.message }, { status: 500 });
    }

    const { error: linkError } = await supabase
      .from("user_job_listings")
      .update({ job_listing_id: jobListing.id })
      .eq("id", id)
      .eq("user_id", user.id);

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    return NextResponse.json({ job_listing_id: jobListing.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to refetch job: ${message}` },
      { status: 500 },
    );
  }
}
