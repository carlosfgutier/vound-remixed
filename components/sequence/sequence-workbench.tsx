"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Ban,
  Flag,
  Loader2,
  Play,
  Reply,
  Rocket,
  RotateCw,
} from "lucide-react";
import type { EmailStrategy } from "@/lib/schema/email-strategy";
import { cn } from "@/lib/utils";
import { setDemoModeAction } from "@/app/(dashboard)/campaigns/[id]/sequence/actions";
import type {
  ContactLite,
  SendLite,
} from "@/app/(dashboard)/campaigns/[id]/sequence/page";
import type { HookPayload } from "@/lib/sequence/types";

type Props = {
  campaignId: string;
  campaignName: string;
  demoMode: boolean;
  status: string;
  strategy: EmailStrategy | null;
  initialRunId: string | null;
  contacts: ContactLite[];
  sends: SendLite[];
};

type LaunchEvent =
  | { type: "start"; total: number }
  | { type: "spawned"; contactId: string; runId: string }
  | { type: "skipped"; contactId: string; reason: string }
  | { type: "done"; spawned: number; skipped: number };

export function SequenceWorkbench({
  campaignId,
  demoMode: initialDemoMode,
  status,
  strategy,
  initialRunId,
  contacts,
  sends,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [demoMode, setDemoMode] = useState(initialDemoMode);
  const [launching, setLaunching] = useState(false);
  const [launchNote, setLaunchNote] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // ---- Demo-mode toggle ---------------------------------------------------

  const toggleDemoMode = useCallback(
    async (next: boolean) => {
      setDemoMode(next); // optimistic
      const res = await setDemoModeAction(campaignId, next);
      if (!res.ok) {
        setDemoMode(!next);
        setLaunchError(res.error);
      }
    },
    [campaignId],
  );

  // ---- Launch stream ------------------------------------------------------

  const consumeStream = useCallback(
    async (runId: string) => {
      const res = await fetch(
        `/api/campaigns/${campaignId}/sequence?runId=${runId}`,
      );
      if (!res.ok || !res.body) {
        throw new Error(`stream failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const event = JSON.parse(line) as LaunchEvent;
            if (event.type === "start") {
              setLaunchNote(`Launching ${event.total} contacts…`);
            } else if (event.type === "spawned") {
              setLaunchNote(`Spawned ${event.contactId.slice(0, 8)}…`);
            } else if (event.type === "done") {
              setLaunchNote(
                `Launched. ${event.spawned} spawned, ${event.skipped} skipped.`,
              );
            }
          } catch {
            /* ignore */
          }
        }
      }

      startTransition(() => {
        router.refresh();
      });
    },
    [campaignId, router],
  );

  const autoSubscribedRef = useRef(false);
  useEffect(() => {
    if (autoSubscribedRef.current || !initialRunId) return;
    autoSubscribedRef.current = true;
    (async () => {
      try {
        await consumeStream(initialRunId);
      } catch {
        /* swallow — run may already be complete */
      }
    })();
  }, [initialRunId, consumeStream]);

  const launch = useCallback(async () => {
    setLaunching(true);
    setLaunchError(null);
    setLaunchNote("Starting launch workflow…");
    try {
      const startRes = await fetch(`/api/campaigns/${campaignId}/sequence`, {
        method: "POST",
      });
      if (!startRes.ok) throw new Error(`start failed (${startRes.status})`);
      const { runId } = (await startRes.json()) as { runId: string };
      await consumeStream(runId);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  }, [campaignId, consumeStream]);

  // ---- Poll for contact/send updates during active runs ------------------

  useEffect(() => {
    if (status !== "running") return;
    const interval = setInterval(() => {
      startTransition(() => router.refresh());
    }, 4000);
    return () => clearInterval(interval);
  }, [status, router]);

  // ---- Simulate event -----------------------------------------------------

  const simulate = useCallback(
    async (contactId: string, kind: HookPayload["kind"]) => {
      try {
        const res = await fetch(
          `/api/campaigns/${campaignId}/sequence/simulate`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ contactId, kind }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setLaunchError(body.error ?? `simulate failed (${res.status})`);
          return;
        }
        // Refresh a moment later to pick up the workflow's DB writes.
        setTimeout(() => {
          startTransition(() => router.refresh());
        }, 600);
      } catch (err) {
        setLaunchError(err instanceof Error ? err.message : "Simulate failed");
      }
    },
    [campaignId, router],
  );

  // ---- Derived buckets ----------------------------------------------------

  const eligibleCount = contacts.filter(
    (c) => c.enrichment_status === "enriched",
  ).length;

  const inSequence = contacts.filter((c) => c.sequence_state === "active");
  const exitedReplied = contacts.filter(
    (c) => c.sequence_state === "exited_replied",
  );
  const exitedOther = contacts.filter(
    (c) =>
      c.sequence_state === "exited_bounced" ||
      c.sequence_state === "exited_complained" ||
      c.sequence_state === "exited_failed",
  );
  const completed = contacts.filter((c) => c.sequence_state === "completed");
  const notStarted = contacts.filter(
    (c) => c.sequence_state === "not_started",
  );

  const sendsByContact = useMemo(() => {
    const map = new Map<string, SendLite[]>();
    for (const s of sends) {
      const list = map.get(s.contact_id) ?? [];
      list.push(s);
      map.set(s.contact_id, list);
    }
    return map;
  }, [sends]);

  // ---- Flow chart counts --------------------------------------------------

  const stepCounts = useMemo(() => {
    if (!strategy) return [];
    return strategy.sequence.map((step) => {
      const sent = sends.filter(
        (s) =>
          s.step === step.step &&
          (s.status === "sent" ||
            s.status === "delivered" ||
            s.status === "opened" ||
            s.status === "replied" ||
            s.status === "bounced" ||
            s.status === "complained"),
      ).length;
      const replied = sends.filter(
        (s) => s.step === step.step && s.status === "replied",
      ).length;
      const bounced = sends.filter(
        (s) => s.step === step.step && s.status === "bounced",
      ).length;
      const complained = sends.filter(
        (s) => s.step === step.step && s.status === "complained",
      ).length;
      const failed = sends.filter(
        (s) => s.step === step.step && s.status === "failed",
      ).length;
      return {
        step: step.step,
        day_offset: step.day_offset,
        sent,
        replied,
        bounced,
        complained,
        failed,
      };
    });
  }, [strategy, sends]);

  // Guard: no strategy yet.
  if (!strategy) {
    return (
      <div className="rounded border border-dashed border-border bg-surface/60 p-6 text-center">
        <p className="text-[12px] text-muted-foreground">
          No email strategy found. Finish{" "}
          <span className="font-medium text-foreground">Phase 4 · Emails</span>{" "}
          first.
        </p>
      </div>
    );
  }

  const launchedAny = sends.length > 0 || contacts.some((c) => c.sequence_state !== "not_started");

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-4">
          <DemoToggle demoMode={demoMode} onChange={toggleDemoMode} />
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            <span>Status</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5",
                status === "running" &&
                  "bg-accent/15 text-accent",
                status === "ready" && "bg-border/60 text-foreground",
                status === "completed" && "bg-border/60 text-muted-foreground",
              )}
            >
              {status}
            </span>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {eligibleCount} eligible · {strategy.sequence.length} steps
          </div>
        </div>
        <div className="flex items-center gap-2">
          {launchNote && !launchError && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {launchNote}
            </span>
          )}
          {launchError && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-destructive">
              <AlertCircle className="h-3 w-3" />
              {launchError}
            </span>
          )}
          <button
            type="button"
            onClick={launch}
            disabled={launching || eligibleCount === 0}
            className={cn(
              "flex items-center gap-1.5 rounded border px-3 py-1.5 text-[12px] font-medium transition-colors",
              launching || eligibleCount === 0
                ? "cursor-not-allowed border-border bg-surface text-muted-foreground"
                : launchedAny
                  ? "border-border bg-surface text-foreground hover:bg-accent/5"
                  : "border-accent bg-accent text-accent-foreground hover:bg-accent/90",
            )}
          >
            {launching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : launchedAny ? (
              <RotateCw className="h-3.5 w-3.5" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            {launching
              ? "Launching…"
              : launchedAny
                ? "Relaunch new contacts"
                : "Launch campaign"}
          </button>
        </div>
      </div>

      {/* Flow chart */}
      <FlowChart strategy={strategy} stats={stepCounts} />

      {/* Tables */}
      <ContactsTable
        title="In sequence"
        icon={<Play className="h-3 w-3" />}
        tone="active"
        contacts={inSequence}
        sendsByContact={sendsByContact}
        totalSteps={strategy.sequence.length}
        demoMode={demoMode}
        onSimulate={simulate}
        emptyHint={
          notStarted.length
            ? `${notStarted.length} contacts ready — press Launch.`
            : "No contacts are active right now."
        }
      />

      <ContactsTable
        title="Exited — replied"
        icon={<Reply className="h-3 w-3" />}
        tone="replied"
        contacts={exitedReplied}
        sendsByContact={sendsByContact}
        totalSteps={strategy.sequence.length}
        demoMode={false}
        onSimulate={simulate}
        emptyHint="No replies yet."
      />

      <ContactsTable
        title="Exited — other"
        icon={<Ban className="h-3 w-3" />}
        tone="negative"
        contacts={exitedOther}
        sendsByContact={sendsByContact}
        totalSteps={strategy.sequence.length}
        demoMode={false}
        onSimulate={simulate}
        emptyHint="No bounces, complaints, or failures."
      />

      {completed.length > 0 && (
        <div className="rounded border border-border bg-surface/60 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <Flag className="mr-1.5 inline h-3 w-3" />
          {completed.length} contacts completed the full sequence without a
          terminal event.
        </div>
      )}
    </div>
  );
}

/* ---------- Demo toggle ------------------------------------------------- */

function DemoToggle({
  demoMode,
  onChange,
}: {
  demoMode: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em]">
      <span
        className={cn(
          "rounded px-1.5 py-0.5",
          demoMode ? "bg-accent/15 text-accent" : "bg-border/60 text-muted-foreground",
        )}
      >
        {demoMode ? "Demo mode" : "Live mode"}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={demoMode}
        onClick={() => onChange(!demoMode)}
        className={cn(
          "relative h-4 w-7 rounded-full border transition-colors",
          demoMode ? "border-accent bg-accent" : "border-border bg-surface",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-background transition-all",
            demoMode ? "left-[14px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}

/* ---------- Flow chart --------------------------------------------------- */

function FlowChart({
  strategy,
  stats,
}: {
  strategy: EmailStrategy;
  stats: {
    step: number;
    day_offset: number;
    sent: number;
    replied: number;
    bounced: number;
    complained: number;
    failed: number;
  }[];
}) {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-foreground">
          Sequence flow
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {strategy.framework}
        </span>
      </div>

      <div className="flex flex-wrap items-stretch gap-2 overflow-x-auto">
        {strategy.sequence.map((step, i) => {
          const s = stats[i];
          return (
            <div key={step.step} className="flex items-stretch gap-2">
              <div className="flex min-w-[150px] flex-col rounded border border-border bg-background px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    Step {step.step}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Day {step.day_offset}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] text-foreground">
                  {step.subject_variants[0] ?? "(no subject)"}
                </div>
                <div className="mt-2 flex items-center gap-3 font-mono text-[10px]">
                  <span className="text-foreground">{s?.sent ?? 0} sent</span>
                  {(s?.replied ?? 0) > 0 && (
                    <span className="text-accent">{s?.replied} reply</span>
                  )}
                  {(s?.bounced ?? 0) + (s?.complained ?? 0) + (s?.failed ?? 0) >
                    0 && (
                    <span className="text-destructive">
                      {(s?.bounced ?? 0) +
                        (s?.complained ?? 0) +
                        (s?.failed ?? 0)}{" "}
                      exit
                    </span>
                  )}
                </div>
              </div>
              {i < strategy.sequence.length - 1 && (
                <div className="flex items-center text-muted-foreground">
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Contacts table ----------------------------------------------- */

function ContactsTable({
  title,
  icon,
  tone,
  contacts,
  sendsByContact,
  totalSteps,
  demoMode,
  onSimulate,
  emptyHint,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "active" | "replied" | "negative";
  contacts: ContactLite[];
  sendsByContact: Map<string, SendLite[]>;
  totalSteps: number;
  demoMode: boolean;
  onSimulate: (contactId: string, kind: HookPayload["kind"]) => void;
  emptyHint: string;
}) {
  const toneClass =
    tone === "active"
      ? "text-accent"
      : tone === "replied"
        ? "text-foreground"
        : "text-destructive";

  return (
    <div className="rounded border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3
          className={cn(
            "flex items-center gap-1.5 text-[12px] font-semibold",
            toneClass,
          )}
        >
          {icon}
          {title}
          <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {contacts.length}
          </span>
        </h3>
      </div>

      {contacts.length === 0 ? (
        <div className="px-4 py-6 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {emptyHint}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-background/60">
              <tr className="text-left font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-4 py-2 font-normal">Contact</th>
                <th className="px-4 py-2 font-normal">Progress</th>
                <th className="px-4 py-2 font-normal">Last event</th>
                {demoMode && (
                  <th className="px-4 py-2 text-right font-normal">Simulate</th>
                )}
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const contactSends = sendsByContact.get(c.id) ?? [];
                const lastSend = contactSends[contactSends.length - 1] ?? null;
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-2 align-top">
                      <div className="text-foreground">
                        {displayName(c)}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {c.email}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <ProgressBar
                        currentStep={c.current_step}
                        totalSteps={totalSteps}
                        tone={tone}
                      />
                    </td>
                    <td className="px-4 py-2 align-top font-mono text-[10px] text-muted-foreground">
                      {lastSend
                        ? `Step ${lastSend.step} · ${lastSend.status}`
                        : c.exit_reason
                          ? c.exit_reason
                          : "—"}
                    </td>
                    {demoMode && (
                      <td className="px-4 py-2 text-right align-top">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1">
                          <SimButton
                            label="reply"
                            onClick={() => onSimulate(c.id, "reply")}
                          />
                          <SimButton
                            label="bounce"
                            onClick={() => onSimulate(c.id, "bounce")}
                          />
                          <SimButton
                            label="complain"
                            onClick={() => onSimulate(c.id, "complaint")}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function displayName(c: ContactLite): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return name || c.email;
}

function ProgressBar({
  currentStep,
  totalSteps,
  tone,
}: {
  currentStep: number;
  totalSteps: number;
  tone: "active" | "replied" | "negative";
}) {
  const pct = totalSteps === 0 ? 0 : Math.min(100, (currentStep / totalSteps) * 100);
  const bar =
    tone === "active"
      ? "bg-accent/70"
      : tone === "replied"
        ? "bg-accent"
        : "bg-destructive/70";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-24 rounded-full bg-border">
        <div
          className={cn("h-1 rounded-full", bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">
        {currentStep}/{totalSteps}
      </span>
    </div>
  );
}

function SimButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-accent hover:text-accent"
    >
      {label}
    </button>
  );
}
