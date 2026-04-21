import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Lightweight status probe for the Loading screen.
 * Returns just the flags we need to decide whether to redirect.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("campaigns")
    .select("enrichment_run_id, strategy_run_id, email_strategy, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    enrichmentRunId: data.enrichment_run_id ?? null,
    strategyRunId: data.strategy_run_id ?? null,
    strategyDone: Boolean(data.email_strategy),
    status: data.status,
  });
}
