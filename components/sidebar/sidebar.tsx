import { getSupabaseAdmin } from "@/lib/supabase/server";
import { SidebarNav, type CampaignListItem } from "./sidebar-nav";

export async function Sidebar() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .order("created_at", { ascending: false })
    .limit(50);

  const campaigns: CampaignListItem[] = (data ?? []).map((c) => ({
    id: c.id as string,
    name: (c.name as string) ?? "Untitled campaign",
    status: (c.status as CampaignListItem["status"]) ?? "draft",
  }));

  return <SidebarNav campaigns={campaigns} />;
}
