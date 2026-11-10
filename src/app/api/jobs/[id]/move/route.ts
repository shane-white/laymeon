import { createClient } from "@/lib/supabase/server";
import { positionBetween } from "@/lib/jobs/sort-order";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Moves a job between two neighbors in the user's order. Neighbors are the
 * visible jobs it was dropped between; null means the top or bottom. The
 * server reads their positions, so the client never sends a raw sort_order.
 */
export async function POST(
  request: NextRequest,
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
  const body = await request.json().catch(() => null);
  const aboveId: unknown = body?.aboveId ?? null;
  const belowId: unknown = body?.belowId ?? null;

  for (const neighbor of [aboveId, belowId]) {
    if (neighbor !== null && (typeof neighbor !== "string" || neighbor === id)) {
      return NextResponse.json({ error: "Invalid neighbor" }, { status: 400 });
    }
  }
  if (aboveId === null && belowId === null) {
    return NextResponse.json({ error: "A neighbor is required" }, { status: 400 });
  }

  async function readPositions() {
    const ids = [id, aboveId, belowId].filter((v): v is string => v !== null);
    const { data, error } = await supabase
      .from("user_job_listings")
      .select("id, sort_order")
      .in("id", ids)
      .eq("user_id", user!.id)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    const byId = new Map(data.map((row) => [row.id as string, row.sort_order as number]));
    if (ids.some((v) => !byId.has(v))) return null;
    return {
      above: aboveId === null ? null : byId.get(aboveId as string)!,
      below: belowId === null ? null : byId.get(belowId as string)!,
    };
  }

  try {
    let positions = await readPositions();
    if (!positions) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (
      positions.above !== null &&
      positions.below !== null &&
      positions.above > positions.below
    ) {
      return NextResponse.json({ error: "Neighbors are out of order" }, { status: 409 });
    }

    let sortOrder = positionBetween(positions.above, positions.below);
    if (sortOrder === null) {
      // The gap is too small for a midpoint: respace this user's jobs and retry.
      const { error } = await supabase.rpc("renumber_job_sort_order");
      if (error) throw new Error(error.message);
      positions = await readPositions();
      sortOrder = positions && positionBetween(positions.above, positions.below);
      if (sortOrder === null) throw new Error("Could not place job");
    }

    const { data, error } = await supabase
      .from("user_job_listings")
      .update({ sort_order: sortOrder })
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .select("id, sort_order")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
