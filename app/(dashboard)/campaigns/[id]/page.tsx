import { notFound, redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ id: string }> };

/**
 * Campaign root. We don't render anything here — it's a smart redirect to
 * whichever phase the campaign is currently in:
 *   - no email_strategy yet → /loading
 *   - email_strategy populated → /preview?tab=fields
 *   - launched (launch_run_id set) → /sequence
 *
 * 404 if the id doesn't resolve to a campaign.
 */
export default async function CampaignRootPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = getSupabaseAdmin();
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, email_strategy, launch_run_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !campaign) notFound();

  if (campaign.launch_run_id) {
    redirect(`/campaigns/${id}/sequence`);
  }
  if (campaign.email_strategy) {
    redirect(`/campaigns/${id}/preview?tab=fields`);
  }
  redirect(`/campaigns/${id}/loading`);
}
