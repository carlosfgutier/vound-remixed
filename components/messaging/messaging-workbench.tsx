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
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Loader2,
  Mail,
  RefreshCw,
  Sparkles,
  User,
} from "lucide-react";
import type { EmailStrategy } from "@/lib/schema/email-strategy";
import {
  renderSequence,
  dynamicTokenKeys,
  type RenderContext,
  type RenderedEmail,
} from "@/lib/email/render-template";
import { cn } from "@/lib/utils";
import {
  updateEmailStrategyAction,
  updateContactOverridesAction,
} from "@/app/(dashboard)/campaigns/[id]/emails/actions";

type AccountLite = {
  id: string;
  company_name: string | null;
  company_linkedin: string | null;
  company_domain: string | null;
  company_website: string | null;
  company_description: string | null;
  industry_iso: string | null;
  employee_count: number | null;
  hq_country: string | null;
  funding_stage: string | null;
  custom_data: Record<string, unknown> | null;
  enrichment_status: string;
};

type ContactLite = {
  id: string;
  account_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  contact_linkedin: string | null;
  job_title: string | null;
  seniority: string | null;
  department: string | null;
  contact_country: string | null;
  custom_data: Record<string, unknown> | null;
  email_overrides: Record<string, string> | null;
  enrichment_status: string;
};

type StrategyEvent =
  | { type: "start" }
  | { type: "thinking"; note: string }
  | { type: "done"; framework: EmailStrategy["framework"]; steps: number }
  | { type: "error"; message: string };

type Props = {
  campaignId: string;
  campaignName: string;
  initialStrategy: EmailStrategy | null;
  initialRunId: string | null;
  accounts: AccountLite[];
  contacts: ContactLite[];
};

export function MessagingWorkbench({
  campaignId,
  initialStrategy,
  initialRunId,
  accounts,
  contacts,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [strategy, setStrategy] = useState<EmailStrategy | null>(initialStrategy);
  const [running, setRunning] = useState(false);
  const [runNote, setRunNote] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Contact picker — default to first enriched contact.
  const enrichedContacts = useMemo(
    () => contacts.filter((c) => c.enrichment_status === "enriched"),
    [contacts],
  );
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    () => enrichedContacts[0]?.id ?? contacts[0]?.id ?? null,
  );

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) ?? null,
    [contacts, selectedContactId],
  );
  const selectedAccount = useMemo(() => {
    if (!selectedContact?.account_id) return null;
    return accounts.find((a) => a.id === selectedContact.account_id) ?? null;
  }, [accounts, selectedContact]);

  // Per-contact local overrides (synced to server via save).
  const [overrides, setOverrides] = useState<Record<string, string>>(
    () => selectedContact?.email_overrides ?? {},
  );
  useEffect(() => {
    setOverrides(selectedContact?.email_overrides ?? {});
  }, [selectedContact]);

  // ---- Stream subscription for strategy generation --------------------------

  const consumeStream = useCallback(
    async (runId: string) => {
      const res = await fetch(
        `/api/campaigns/${campaignId}/messaging?runId=${runId}`,
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
          let event: StrategyEvent | null = null;
          try {
            event = JSON.parse(line) as StrategyEvent;
          } catch {
            continue;
          }
          if (!event) continue;
          if (event.type === "thinking") {
            setRunNote(event.note);
          } else if (event.type === "done") {
            setRunNote(`Done. ${event.framework} · ${event.steps} steps.`);
          } else if (event.type === "error") {
            setRunError(event.message);
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
    if (autoSubscribedRef.current) return;
    if (!initialRunId) return;
    if (initialStrategy) return; // already have a saved strategy
    autoSubscribedRef.current = true;
    (async () => {
      setRunning(true);
      setRunError(null);
      try {
        await consumeStream(initialRunId);
      } catch (err) {
        setRunError(err instanceof Error ? err.message : "Stream error");
      } finally {
        setRunning(false);
      }
    })();
  }, [initialRunId, initialStrategy, consumeStream]);

  const regenerate = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    setRunNote("Starting strategist…");
    try {
      const startRes = await fetch(`/api/campaigns/${campaignId}/messaging`, {
        method: "POST",
      });
      if (!startRes.ok) throw new Error(`start failed (${startRes.status})`);
      const { runId } = (await startRes.json()) as { runId: string };
      await consumeStream(runId);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Strategist failed");
    } finally {
      setRunning(false);
    }
  }, [campaignId, consumeStream]);

  // ---- Editing strategy (campaign level) -----------------------------------

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const saveStrategy = useCallback(
    async (next: EmailStrategy) => {
      setSaving(true);
      setSaveError(null);
      try {
        const result = await updateEmailStrategyAction(campaignId, next);
        if (!result.ok) {
          setSaveError(result.error);
        } else {
          setStrategy(next);
          setSavedAt(Date.now());
        }
      } finally {
        setSaving(false);
      }
    },
    [campaignId],
  );

  const onEditStep = useCallback(
    (idx: number, patch: Partial<EmailStrategy["sequence"][number]>) => {
      if (!strategy) return;
      const nextSequence = strategy.sequence.map((s, i) =>
        i === idx ? { ...s, ...patch } : s,
      );
      const next = { ...strategy, sequence: nextSequence };
      setStrategy(next); // optimistic
      void saveStrategy(next);
    },
    [strategy, saveStrategy],
  );

  const onEditTokenDefault = useCallback(
    (tokenKey: string, value: string) => {
      if (!strategy) return;
      const nextTokens = strategy.tokens.map((t) =>
        t.key === tokenKey ? { ...t, default_value: value } : t,
      );
      const next = { ...strategy, tokens: nextTokens };
      setStrategy(next);
      void saveStrategy(next);
    },
    [strategy, saveStrategy],
  );

  // ---- Per-contact overrides -----------------------------------------------

  const saveOverrides = useCallback(
    async (next: Record<string, string>) => {
      if (!selectedContact) return;
      setSaving(true);
      setSaveError(null);
      try {
        const result = await updateContactOverridesAction(
          campaignId,
          selectedContact.id,
          next,
        );
        if (!result.ok) {
          setSaveError(result.error);
        } else {
          setSavedAt(Date.now());
        }
      } finally {
        setSaving(false);
      }
    },
    [campaignId, selectedContact],
  );

  const onEditOverride = useCallback(
    (tokenKey: string, value: string) => {
      setOverrides((prev) => {
        const next = { ...prev };
        if (value.trim() === "") {
          delete next[tokenKey];
        } else {
          next[tokenKey] = value;
        }
        void saveOverrides(next);
        return next;
      });
    },
    [saveOverrides],
  );

  // ---- Render preview -------------------------------------------------------

  const renderCtx: RenderContext | null = useMemo(() => {
    if (!selectedContact) return null;
    return {
      contact: {
        id: selectedContact.id,
        email: selectedContact.email,
        first_name: selectedContact.first_name,
        last_name: selectedContact.last_name,
        contact_linkedin: selectedContact.contact_linkedin,
        job_title: selectedContact.job_title,
        seniority: selectedContact.seniority,
        department: selectedContact.department,
        contact_country: selectedContact.contact_country,
        custom_data: selectedContact.custom_data,
      },
      account: selectedAccount
        ? {
            id: selectedAccount.id,
            company_name: selectedAccount.company_name,
            company_linkedin: selectedAccount.company_linkedin,
            company_domain: selectedAccount.company_domain,
            company_website: selectedAccount.company_website,
            company_description: selectedAccount.company_description,
            industry_iso: selectedAccount.industry_iso,
            employee_count: selectedAccount.employee_count,
            hq_country: selectedAccount.hq_country,
            funding_stage: selectedAccount.funding_stage,
            custom_data: selectedAccount.custom_data,
          }
        : null,
      overrides,
    };
  }, [selectedContact, selectedAccount, overrides]);

  const rendered: RenderedEmail[] = useMemo(() => {
    if (!strategy || !renderCtx) return [];
    return renderSequence(strategy, renderCtx);
  }, [strategy, renderCtx]);

  const dynTokens = useMemo(
    () => (strategy ? dynamicTokenKeys(strategy) : new Set<string>()),
    [strategy],
  );

  // ---- Empty states --------------------------------------------------------

  if (!strategy) {
    return (
      <div className="flex flex-col gap-4">
        <StrategyRunStatus
          running={running}
          note={runNote}
          error={runError}
          onRegenerate={regenerate}
          hasStrategy={false}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <StrategyHeader
        campaignId={campaignId}
        strategy={strategy}
        running={running}
        note={runNote}
        saving={saving}
        saveError={saveError}
        savedAt={savedAt}
        onRegenerate={regenerate}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* LEFT: editable sequence */}
        <div className="flex flex-col gap-4">
          {strategy.sequence.map((step, i) => (
            <StepCard
              key={step.step}
              step={step}
              onChange={(patch) => onEditStep(i, patch)}
              disabled={running || saving}
            />
          ))}

          <TokenLibrary
            strategy={strategy}
            dynTokens={dynTokens}
            onEditDefault={onEditTokenDefault}
            disabled={running || saving}
          />
        </div>

        {/* RIGHT: contact picker + live preview */}
        <div className="flex flex-col gap-4">
          <ContactPicker
            contacts={contacts}
            selectedId={selectedContactId}
            onSelect={setSelectedContactId}
          />
          <PreviewPane
            rendered={rendered}
            overrides={overrides}
            dynTokens={dynTokens}
            strategy={strategy}
            onEditOverride={onEditOverride}
            disabled={!selectedContact || saving}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StrategyRunStatus({
  running,
  note,
  error,
  onRegenerate,
  hasStrategy,
}: {
  running: boolean;
  note: string | null;
  error: string | null;
  onRegenerate: () => void;
  hasStrategy: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface/30 px-6 py-10 text-center">
      <Sparkles className="mx-auto h-5 w-5 text-accent" />
      <h3 className="mt-3 text-sm font-medium text-foreground">
        {running ? "Designing your sequence…" : "No strategy yet"}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-muted-foreground">
        {running
          ? note ??
            "The marketing strategist is reviewing enriched data and picking a framework."
          : hasStrategy
            ? "Strategy exists but could not be parsed. Regenerate to rebuild."
            : "Run the marketing strategist to produce a sequence of templated emails with conditional personalization."}
      </p>
      {error && (
        <p className="mx-auto mt-2 max-w-md text-[11px] text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onRegenerate}
        disabled={running}
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-medium transition",
          running
            ? "cursor-not-allowed border-border bg-surface text-muted-foreground"
            : "border-accent/60 bg-accent text-background hover:bg-accent/90",
        )}
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {running ? "Working…" : "Generate strategy"}
      </button>
    </div>
  );
}

function StrategyHeader({
  campaignId,
  strategy,
  running,
  note,
  saving,
  saveError,
  savedAt,
  onRegenerate,
}: {
  campaignId: string;
  strategy: EmailStrategy;
  running: boolean;
  note: string | null;
  saving: boolean;
  saveError: string | null;
  savedAt: number | null;
  onRegenerate: () => void;
}) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!savedAt) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(t);
  }, [savedAt]);

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface/40 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-accent">
          {strategy.framework}
        </span>
        <div className="min-w-0">
          <p className="text-[12px] leading-relaxed text-foreground">
            {strategy.framework_rationale}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {strategy.sequence.length} step
            {strategy.sequence.length === 1 ? "" : "s"} ·{" "}
            {strategy.tokens.length} token
            {strategy.tokens.length === 1 ? "" : "s"} ·{" "}
            {strategy.personalization_rules.length} rule
            {strategy.personalization_rules.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {running && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {note ?? "thinking…"}
          </span>
        )}
        {!running && saving && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            saving
          </span>
        )}
        {!running && !saving && flash && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-success">
            <Check className="h-3 w-3" />
            saved
          </span>
        )}
        {saveError && (
          <span
            title={saveError}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-destructive"
          >
            <AlertCircle className="h-3 w-3" />
            save error
          </span>
        )}
        <button
          type="button"
          onClick={onRegenerate}
          disabled={running}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium transition",
            running
              ? "cursor-not-allowed opacity-60"
              : "text-muted-foreground hover:bg-surface hover:text-foreground",
          )}
          title="Regenerate strategy"
        >
          <RefreshCw className={cn("h-3 w-3", running && "animate-spin")} />
          Regenerate
        </button>
        <Link
          href={`/campaigns/${campaignId}/sequence`}
          aria-disabled={running}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-accent bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground transition hover:bg-accent/90",
            running && "pointer-events-none opacity-60",
          )}
          title="Continue to sequence"
        >
          Continue to sequence
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function StepCard({
  step,
  onChange,
  disabled,
}: {
  step: EmailStrategy["sequence"][number];
  onChange: (patch: Partial<EmailStrategy["sequence"][number]>) => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface/20">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 font-mono text-[10px] text-accent">
            {step.step}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Day {step.day_offset}
          </span>
          {step.is_thread && (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              · threaded
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {step.goal}
        </span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <div>
          <LabelRow label="Subject" />
          <div className="flex flex-col gap-1">
            {step.subject_variants.map((s, i) => (
              <InlineInput
                key={i}
                value={s}
                disabled={disabled}
                onChange={(v) => {
                  const next = [...step.subject_variants];
                  next[i] = v;
                  onChange({ subject_variants: next as typeof step.subject_variants });
                }}
                placeholder="lowercase subject, 2–5 words"
              />
            ))}
          </div>
        </div>

        <div>
          <LabelRow label="Body template" />
          <InlineTextarea
            value={step.body_template}
            disabled={disabled}
            onChange={(v) => onChange({ body_template: v })}
            rows={6}
          />
        </div>

        <div>
          <LabelRow label="CTA" />
          <InlineInput
            value={step.cta}
            disabled={disabled}
            onChange={(v) => onChange({ cta: v })}
            placeholder="Reply-only ask in E1"
          />
        </div>
      </div>
    </div>
  );
}

function LabelRow({ label }: { label: string }) {
  return (
    <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
      {label}
    </div>
  );
}

function InlineInput({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <input
      type="text"
      value={local}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onChange(local);
      }}
      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[12px] text-foreground outline-none transition focus:border-accent disabled:opacity-60"
    />
  );
}

function InlineTextarea({
  value,
  onChange,
  disabled,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  rows?: number;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <textarea
      value={local}
      disabled={disabled}
      rows={rows}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onChange(local);
      }}
      className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[12px] leading-relaxed text-foreground outline-none transition focus:border-accent disabled:opacity-60"
    />
  );
}

function TokenLibrary({
  strategy,
  dynTokens,
  onEditDefault,
  disabled,
}: {
  strategy: EmailStrategy;
  dynTokens: Set<string>;
  onEditDefault: (tokenKey: string, value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface/20">
      <div className="border-b border-border px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Tokens
        </span>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {strategy.tokens.map((t) => {
          const isDynamic = dynTokens.has(t.key);
          const rules = strategy.personalization_rules.filter(
            (r) => r.token_key === t.key,
          );
          return (
            <div key={t.key} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <code className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] text-accent">
                    {`{{token.${t.key}}}`}
                  </code>
                  <span
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em]",
                      isDynamic
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-border bg-surface text-muted-foreground",
                    )}
                  >
                    {isDynamic ? "dynamic" : "static"}
                  </span>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t.description}
              </p>
              <div>
                <LabelRow label="Default value" />
                <InlineInput
                  value={t.default_value}
                  disabled={disabled}
                  onChange={(v) => onEditDefault(t.key, v)}
                />
              </div>
              {rules.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground">
                    {rules.length} rule{rules.length === 1 ? "" : "s"}
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {rules.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px]"
                      >
                        <div className="font-mono text-[10px] text-muted-foreground">
                          when <code>{r.when}</code>
                        </div>
                        <div className="mt-0.5 text-foreground">
                          → {r.value}
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContactPicker({
  contacts,
  selectedId,
  onSelect,
}: {
  contacts: ContactLite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const hay = [
        c.email,
        c.first_name,
        c.last_name,
        c.job_title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, query]);

  return (
    <div className="rounded-lg border border-border bg-surface/20">
      <div className="border-b border-border px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Preview for
        </span>
      </div>
      <div className="p-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search contacts…"
          className="mb-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-accent"
        />
        <div className="max-h-60 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
              No contacts match.
            </p>
          )}
          {filtered.map((c) => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
            const selected = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-md border-l-2 px-2.5 py-1.5 text-left transition",
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-transparent hover:bg-surface",
                )}
              >
                <div className="flex w-full items-center gap-2">
                  <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-[12px] text-foreground">
                    {name || c.email}
                  </span>
                  {c.enrichment_status === "enriched" ? (
                    <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.06em] text-success">
                      enriched
                    </span>
                  ) : (
                    <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                      {c.enrichment_status}
                    </span>
                  )}
                </div>
                {name && (
                  <span className="ml-5 truncate text-[10px] text-muted-foreground">
                    {c.email}
                  </span>
                )}
                {c.job_title && (
                  <span className="ml-5 truncate text-[10px] text-muted-foreground">
                    {c.job_title}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PreviewPane({
  rendered,
  overrides,
  dynTokens,
  strategy,
  onEditOverride,
  disabled,
}: {
  rendered: RenderedEmail[];
  overrides: Record<string, string>;
  dynTokens: Set<string>;
  strategy: EmailStrategy;
  onEditOverride: (tokenKey: string, value: string) => void;
  disabled: boolean;
}) {
  if (rendered.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface/20 px-4 py-8 text-center text-[11px] text-muted-foreground">
        Pick a contact to preview their cadence.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-surface/20">
        <div className="border-b border-border px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Rendered cadence
          </span>
        </div>
        <div className="flex flex-col divide-y divide-border">
          {rendered.map((r) => (
            <div key={r.step} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center gap-2">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Step {r.step} · Day {r.day_offset}
                  {r.is_thread && " · threaded"}
                </span>
              </div>
              <div className="text-[12px] font-medium text-foreground">
                {r.subject || (
                  <span className="italic text-muted-foreground">(no subject)</span>
                )}
              </div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
                {r.body}
              </pre>
              {r.warnings.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">
                  {r.warnings.join(" · ")}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Per-contact overrides for dynamic tokens only */}
      {strategy.tokens.filter((t) => dynTokens.has(t.key)).length > 0 && (
        <div className="rounded-lg border border-border bg-surface/20">
          <div className="border-b border-border px-4 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Personalization for this contact
            </span>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {strategy.tokens
              .filter((t) => dynTokens.has(t.key))
              .map((t) => {
                const rendered0 = rendered[0]?.resolved_tokens[t.key] ?? "";
                const override = overrides[t.key];
                return (
                  <div key={t.key} className="flex flex-col gap-1.5 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent">
                        {t.key}
                      </code>
                      <span className="text-[10px] text-muted-foreground">
                        {t.description}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      resolved:{" "}
                      <span className="text-foreground">{rendered0 || "—"}</span>
                    </div>
                    <InlineInput
                      value={override ?? ""}
                      disabled={disabled}
                      onChange={(v) => onEditOverride(t.key, v)}
                      placeholder="Override for this contact only (empty = use rule/default)"
                    />
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
