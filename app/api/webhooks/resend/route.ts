import { resumeHook } from "workflow/api";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  contactHookToken,
  type HookPayload,
  type ResendEvent,
} from "@/lib/sequence/types";

/**
 * Resend webhook receiver.
 *
 * We map the event's `email_id` (or failing that, the recipient `to[0]`) back
 * to an `email_sends` row, find the contact + step, and resume the matching
 * workflow hook. The hook token scheme is `seq:{contactId}:{step}`.
 *
 * Resend sends: email.sent, email.delivered, email.opened, email.bounced,
 * email.complained, email.replied. We handle delivered / opened (non-terminal,
 * just annotate the row) and reply/bounce/complaint (terminal — exit sequence).
 */
export async function POST(req: Request) {
  let event: ResendEvent;
  try {
    event = (await req.json()) as ResendEvent;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const emailId = event.data?.email_id;
  const recipient = event.data?.to?.[0] ?? null;

  // Find the send row so we know which contact + step this event is for.
  type SendRow = { id: string; contact_id: string; step: number };
  let sendRow: SendRow | null = null;

  if (emailId) {
    const { data } = await supabase
      .from("email_sends")
      .select("id, contact_id, step")
      .eq("message_id", emailId)
      .maybeSingle();
    sendRow = (data as SendRow | null) ?? null;
  }

  // Fallback: match by recipient email + latest step. Useful when the webhook
  // lacks the email_id (e.g. replies may come via a different channel).
  if (!sendRow && recipient) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", recipient)
      .maybeSingle();
    if (contact) {
      const { data: latest } = await supabase
        .from("email_sends")
        .select("id, contact_id, step")
        .eq("contact_id", (contact as { id: string }).id)
        .order("step", { ascending: false })
        .limit(1)
        .maybeSingle();
      sendRow = (latest as SendRow | null) ?? null;
    }
  }

  if (!sendRow) {
    console.warn("[webhook:resend] no matching send row", { emailId, recipient });
    return Response.json({ ok: true, matched: false });
  }

  const kind = mapEventToKind(event.type);
  if (!kind) {
    console.log("[webhook:resend] ignoring event", { type: event.type });
    return Response.json({ ok: true, ignored: true });
  }

  // Update the send row with event metadata (non-terminal events still care).
  await annotateSendRow(sendRow.id, kind);

  // Resume the workflow hook for this (contact, step). The workflow decides
  // whether it's a terminal exit or just a status update.
  try {
    await resumeHook(
      contactHookToken(sendRow.contact_id, sendRow.step),
      { kind } satisfies HookPayload,
    );
  } catch (err) {
    // Hook may already be consumed (workflow moved on). That's OK.
    console.warn("[webhook:resend] resumeHook failed", err);
  }

  return Response.json({ ok: true, matched: true, kind });
}

function mapEventToKind(type: ResendEvent["type"]): HookPayload["kind"] | null {
  switch (type) {
    case "email.replied":
      return "reply";
    case "email.bounced":
      return "bounce";
    case "email.complained":
      return "complaint";
    case "email.delivered":
      return "delivered";
    case "email.opened":
      return "opened";
    default:
      return null;
  }
}

async function annotateSendRow(sendId: string, kind: HookPayload["kind"]) {
  const supabase = getSupabaseAdmin();
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
  await supabase.from("email_sends").update(patch).eq("id", sendId);
}
