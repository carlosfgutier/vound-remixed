"use server";

import { campaignInputSchema, type CampaignInput } from "@/lib/schema/campaign-input";
import type { EnrichmentSpec } from "@/lib/schema/enrichment-spec";
import { generateEnrichmentSpec } from "@/lib/ai/generate-enrichment-spec";

export type DefineEnrichmentResult =
  | { ok: true; spec: EnrichmentSpec; input: CampaignInput }
  | { ok: false; error: string };

export async function defineEnrichmentAction(
  raw: unknown,
): Promise<DefineEnrichmentResult> {
  const parsed = campaignInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid campaign input." };
  }

  try {
    const spec = await generateEnrichmentSpec(parsed.data);
    return { ok: true, spec, input: parsed.data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate enrichment spec.";
    return { ok: false, error: message };
  }
}
