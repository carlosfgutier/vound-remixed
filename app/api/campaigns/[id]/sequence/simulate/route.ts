import { resumeHook } from "workflow/api";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  contactHookToken,
  type HookPayload,
} from "@/lib/sequence/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Demo-only endpoint. In demo mode (no Resend webhook wired up), the UI posts
 * here to fake a reply / bounce / complaint for a given contact. We find the
 * latest send row for the contact, annotate it, and resume the hook — exactly
 * the same contract as the real Resend webhook.
 */
export async function POST(req: Request, { params }: Params) {
  const { id: campaignId } = await params;

  let body: { contactId: string; kind: HookPayload["kind"] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const { contactId, kind } = body;
  if (!contactId || !kind) {
    return Response.json({ error: "contactId and kind required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: latest } = await supabase
    .from("email_sends")
    .select("id, step")
    .eq("campaign_id", campaignId)
    .eq("contact_id", contactId)
    .order("step", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) {
    return Response.json({ error: "no send row for contact" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (kind === "reply") {
    patch.status = "replied";
    patch.replied_at = now;
  } else if (kind === "bounce") {
    patch.status = "bounced";
    patch.bounced_at = now;
  } else if (kind === "complaint") {
    patch.status = "complained";
    patch.complained_at = now;
  } else if (kind === "delivered") {
    patch.status = "delivered";
    patch.delivered_at = now;
  } else if (kind === "opened") {
    patch.status = "opened";
  }
  await supabase.from("email_sends").update(patch).eq("id", latest.id as string);

  try {
    await resumeHook(
      contactHookToken(contactId, latest.step as number),
      { kind } satisfies HookPayload,
    );
    console.log("[simulate] resumed hook", { contactId, step: latest.step, kind });
  } catch (err) {
    console.warn("[simulate] resumeHook failed", err);
    return Response.json({ error: "resumeHook failed" }, { status: 500 });
  }

  return Response.json({ ok: true, step: latest.step, kind });
}
