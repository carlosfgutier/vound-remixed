"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function setDemoModeAction(
  campaignId: string,
  demoMode: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("campaigns")
    .update({ demo_mode: demoMode })
    .eq("id", campaignId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}/sequence`);
  return { ok: true };
}
