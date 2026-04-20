import { FatalError, createHook, sleep } from "workflow";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  emailStrategySchema,
  type EmailStrategy,
} from "@/lib/schema/email-strategy";
import {
  renderStep,
  type RenderContext,
} from "@/lib/email/render-template";
import { sendEmail } from "@/lib/email/sender";
import {
  contactHookToken,
  DEMO_DAY_SECONDS,
  EXIT_REASONS,
  type HookPayload,
  type SendStatus,
  type SequenceState,
} from "@/lib/sequence/types";

type LoadedContact = {
  strategy: EmailStrategy;
  demoMode: boolean;
  renderCtx: RenderContext;
  already_sent_steps: number[];
};

async function loadContext(
  campaignId: string,
  contactId: string,
): Promise<LoadedContact> {
  "use step";
  console.log("[send] loadContext", { campaignId, contactId });
  const supabase = getSupabaseAdmin();

  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("id, demo_mode, email_strategy")
    .eq("id", campaignId)
    .maybeSingle();
  if (cErr || !campaign) throw new FatalError("Campaign not found");

  const parsed = emailStrategySchema.safeParse(campaign.email_strategy);
  if (!parsed.success) {
    throw new FatalError("Campaign has no valid email_strategy");
  }

  const { data: contact, error: coErr } = await supabase
    .from("contacts")
    .select(
      "id, account_id, email, first_name, last_name, contact_linkedin, job_title, seniority, department, contact_country, custom_data, email_overrides",
    )
    .eq("id", contactId)
    .maybeSingle();
  if (coErr || !contact) throw new FatalError("Contact not found");

  let account = null;
  if (contact.account_id) {
    const { data: acc } = await supabase
      .from("accounts")
      .select(
        "id, company_name, company_linkedin, company_domain, company_website, company_description, industry_iso, employee_count, hq_country, funding_stage, custom_data",
      )
      .eq("id", contact.account_id)
      .maybeSingle();
    account = acc ?? null;
  }

  const { data: prevSends } = await supabase
    .from("email_sends")
    .select("step")
    .eq("campaign_id", campaignId)
    .eq("contact_id", contactId);
  const already = (prevSends ?? []).map((r) => r.step as number);

  return {
    strategy: parsed.data,
    demoMode: Boolean(campaign.demo_mode),
    renderCtx: {
      contact: {
        id: contact.id as string,
        email: contact.email as string,
        first_name: (contact.first_name as string | null) ?? null,
        last_name: (contact.last_name as string | null) ?? null,
        contact_linkedin: (contact.contact_linkedin as string | null) ?? null,
        job_title: (contact.job_title as string | null) ?? null,
        seniority: (contact.seniority as string | null) ?? null,
        department: (contact.department as string | null) ?? null,
        contact_country: (contact.contact_country as string | null) ?? null,
        custom_data: (contact.custom_data as Record<string, unknown> | null) ?? null,
      },
      account: account
        ? {
            id: account.id as string,
            company_name: (account.company_name as string | null) ?? null,
            company_linkedin: (account.company_linkedin as string | null) ?? null,
            company_domain: (account.company_domain as string | null) ?? null,
            company_website: (account.company_website as string | null) ?? null,
            company_description:
              (account.company_description as string | null) ?? null,
            industry_iso: (account.industry_iso as string | null) ?? null,
            employee_count: (account.employee_count as number | null) ?? null,
            hq_country: (account.hq_country as string | null) ?? null,
            funding_stage: (account.funding_stage as string | null) ?? null,
            custom_data:
              (account.custom_data as Record<string, unknown> | null) ?? null,
          }
        : null,
      overrides:
        (contact.email_overrides as Record<string, string> | null) ?? {},
    },
    already_sent_steps: already,
  };
}

async function markContactState(
  contactId: string,
  state: SequenceState,
  currentStep: number | null,
  exitReason: string | null = null,
) {
  "use step";
  console.log("[send] markContactState", { contactId, state, currentStep, exitReason });
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {
    sequence_state: state,
  };
  if (currentStep !== null) patch.current_step = currentStep;
  if (state.startsWith("exited") || state === "completed") {
    patch.exited_at = new Date().toISOString();
    patch.exit_reason = exitReason;
  }
  await supabase.from("contacts").update(patch).eq("id", contactId);
}

async function persistQueuedSend(
  campaignId: string,
  contactId: string,
  step: number,
  subject: string,
  body: string,
): Promise<string> {
  "use step";
  console.log("[send] persistQueuedSend", { campaignId, contactId, step });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("email_sends")
    .insert({
      campaign_id: campaignId,
      contact_id: contactId,
      step,
      subject,
      body_rendered: body,
      status: "queued" satisfies SendStatus,
    })
    .select("id")
    .single();
  if (error || !data) throw new FatalError(error?.message ?? "Insert failed");
  return data.id as string;
}

async function updateSendRow(
  sendId: string,
  patch: {
    status?: SendStatus;
    message_id?: string | null;
    error?: string | null;
    sent_at?: string | null;
  },
) {
  "use step";
  const supabase = getSupabaseAdmin();
  await supabase.from("email_sends").update(patch).eq("id", sendId);
}

async function sendEmailStep(
  sendId: string,
  to: string,
  subject: string,
  text: string,
  demoMode: boolean,
): Promise<{ ok: boolean; message_id?: string; error?: string }> {
  "use step";
  console.log("[send] sendEmailStep:start", { sendId, to, demoMode });
  const result = await sendEmail({ to, subject, text }, demoMode);
  const supabase = getSupabaseAdmin();
  if (result.ok) {
    await supabase
      .from("email_sends")
      .update({
        status: "sent" satisfies SendStatus,
        message_id: result.message_id,
        sent_at: new Date().toISOString(),
      })
      .eq("id", sendId);
    return { ok: true, message_id: result.message_id };
  }
  await supabase
    .from("email_sends")
    .update({
      status: "failed" satisfies SendStatus,
      error: result.error,
    })
    .eq("id", sendId);
  return { ok: false, error: result.error };
}

async function recordEvent(
  sendId: string,
  kind: HookPayload["kind"],
) {
  "use step";
  console.log("[send] recordEvent", { sendId, kind });
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  const now = new Date().toISOString();
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

/**
 * Durable per-contact sequence workflow.
 *
 * For each strategy step: render → queue → send → wait for (next-step day
 * offset) OR (reply/bounce/complaint hook), whichever fires first. Exits the
 * sequence on any terminal event. Skips steps already sent (for resume).
 */
export async function sendContactSequenceWorkflow(
  campaignId: string,
  contactId: string,
) {
  "use workflow";
  console.log("[send] workflow:start", { campaignId, contactId });

  const ctx = await loadContext(campaignId, contactId);
  const { strategy, demoMode, renderCtx, already_sent_steps } = ctx;
  const dayUnitSeconds = demoMode ? DEMO_DAY_SECONDS : 86400;

  await markContactState(contactId, "active", 0);

  for (let i = 0; i < strategy.sequence.length; i++) {
    const step = strategy.sequence[i]!;

    if (already_sent_steps.includes(step.step)) {
      console.log("[send] skipping already-sent step", step.step);
      continue;
    }

    // Wait until this step's day offset. Step 1 usually has day_offset 0.
    // The gap between steps is driven by the delta between consecutive
    // day_offsets (so day_offset is interpreted as absolute from launch).
    const prevOffset =
      i === 0 ? 0 : strategy.sequence[i - 1]!.day_offset;
    const delta = Math.max(0, step.day_offset - prevOffset);
    if (delta > 0) {
      const seconds = delta * dayUnitSeconds;
      console.log("[send] sleeping before step", {
        step: step.step,
        days: delta,
        seconds,
      });

      // Race: sleep vs. hook on the PREVIOUS step. If we're on step i>0, a
      // reply/bounce from step i-1 might arrive during the wait. The hook for
      // the prior step is still live since we never got to exit.
      const prevHook = createHook<HookPayload>({
        token: contactHookToken(contactId, strategy.sequence[Math.max(0, i - 1)]!.step),
      });

      const exitDuringWait = await Promise.race([
        (async () => {
          await sleep(`${seconds}s`);
          return { kind: "timeout" as const };
        })(),
        (async () => {
          const evt = await prevHook;
          return { kind: "event" as const, evt };
        })(),
      ]);

      if (exitDuringWait.kind === "event") {
        await handleTerminalEvent(contactId, i - 1, exitDuringWait.evt);
        return { campaignId, contactId, exited: exitDuringWait.evt.kind };
      }
    }

    // Render and send.
    const rendered = renderStep(strategy, step, renderCtx);
    const sendId = await persistQueuedSend(
      campaignId,
      contactId,
      step.step,
      rendered.subject,
      rendered.body,
    );

    await markContactState(contactId, "active", step.step);

    const sendResult = await sendEmailStep(
      sendId,
      renderCtx.contact.email,
      rendered.subject,
      rendered.body,
      demoMode,
    );

    if (!sendResult.ok) {
      await markContactState(
        contactId,
        "exited_failed",
        step.step,
        sendResult.error ?? "Send failed",
      );
      return { campaignId, contactId, exited: "failed" as const };
    }

    // After sending, wait for either:
    //   (a) a terminal event (reply/bounce/complaint) on THIS step
    //   (b) the next step's day_offset to arrive (handled at top of next loop)
    // We don't block here — the loop's top-of-iteration sleep handles the wait
    // and races the hook for the previous step at that point.
    //
    // BUT: if this is the LAST step, we still need to wait some grace period
    // for a reply before marking completed. Use 3x the demo day (or 3 real
    // days) as a grace window.
    const isLast = i === strategy.sequence.length - 1;
    if (isLast) {
      const grace = 3 * dayUnitSeconds;
      const hook = createHook<HookPayload>({
        token: contactHookToken(contactId, step.step),
      });
      const finalRace = await Promise.race([
        (async () => {
          await sleep(`${grace}s`);
          return { kind: "timeout" as const };
        })(),
        (async () => {
          const evt = await hook;
          return { kind: "event" as const, evt };
        })(),
      ]);
      if (finalRace.kind === "event") {
        await handleTerminalEvent(contactId, i, finalRace.evt);
        return { campaignId, contactId, exited: finalRace.evt.kind };
      }
      await markContactState(contactId, "completed", step.step);
      return { campaignId, contactId, exited: "completed" as const };
    }
  }

  await markContactState(contactId, "completed", strategy.sequence.length);
  return { campaignId, contactId, exited: "completed" as const };
}

/** Translate a hook payload into the terminal state + mutate DB. */
async function handleTerminalEvent(
  contactId: string,
  stepIndex: number,
  evt: HookPayload,
) {
  "use step";
  console.log("[send] handleTerminalEvent", { contactId, stepIndex, kind: evt.kind });
  const state = terminalStateFor(evt.kind);
  const supabase = getSupabaseAdmin();
  await supabase
    .from("contacts")
    .update({
      sequence_state: state,
      exited_at: new Date().toISOString(),
      exit_reason: evt.kind,
    })
    .eq("id", contactId);
}

function terminalStateFor(kind: HookPayload["kind"]): SequenceState {
  switch (kind) {
    case "reply":
      return EXIT_REASONS.replied;
    case "bounce":
      return EXIT_REASONS.bounced;
    case "complaint":
      return EXIT_REASONS.complained;
    default:
      return "active";
  }
}
