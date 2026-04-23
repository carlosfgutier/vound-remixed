"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  Mail,
} from "lucide-react";
import type { EmailStrategy } from "@/lib/schema/email-strategy";
import {
  renderSequence,
  dynamicTokenKeys,
  type RenderContext,
  type RenderedEmail,
} from "@/lib/email/render-template";
import { cn } from "@/lib/utils";
import type {
  AccountLite,
  ContactLite,
} from "@/app/(dashboard)/campaigns/[id]/preview/page";
import {
  updateEmailStrategyAction,
} from "@/app/(dashboard)/campaigns/[id]/preview/actions";

const RATIONALE_MAX = 500;

type Props = {
  campaignId: string;
  campaignName: string;
  initialStrategy: EmailStrategy;
  initialRunId: string | null;
  accounts: AccountLite[];
  contacts: ContactLite[];
  initialStepIdx: number | null;
  onStepChange: (idx: number | null) => void;
};

/**
 * Tab 3: strategy review + token editing + Create and Launch.
 *
 * Differences vs the old messaging workbench:
 * - No per-contact overrides (global tokens only).
 * - Step chips across the top act as a filter; "All" shows the full stack.
 * - Token editor below the preview shows only tokens referenced in the
 *   currently visible step(s).
 * - Primary CTA is "Create and Launch" which kicks off the launch workflow.
 */
export function EmailsTab({
  campaignId,
  initialStrategy,
  accounts,
  contacts,
  initialStepIdx,
  onStepChange,
}: Props) {
  const [strategy, setStrategy] = useState<EmailStrategy>(initialStrategy);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Step filter: null = "All"; otherwise 0-indexed step.
  const clampedInitialIdx =
    initialStepIdx != null && initialStepIdx < initialStrategy.sequence.length
      ? initialStepIdx
      : null;
  const [stepFilter, setStepFilter] = useState<number | null>(clampedInitialIdx);

  // Single contact dropdown — default to first enriched, fall back to first.
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

  // --- Save strategy (debounced via onBlur callers) -------------------------
  const saveStrategy = useCallback(
    async (next: EmailStrategy) => {
      setSaving(true);
      setSaveError(null);
      try {
        const result = await updateEmailStrategyAction(campaignId, next);
        if (!result.ok) {
          setSaveError(result.error);
        } else {
          setSavedAt(Date.now());
        }
      } finally {
        setSaving(false);
      }
    },
    [campaignId],
  );

  const onEditTokenDefault = useCallback(
    (tokenKey: string, value: string) => {
      const nextTokens = strategy.tokens.map((t) =>
        t.key === tokenKey ? { ...t, default_value: value } : t,
      );
      const next = { ...strategy, tokens: nextTokens };
      setStrategy(next); // optimistic
      void saveStrategy(next);
    },
    [strategy, saveStrategy],
  );

  // Subject variant ("A / B") switcher: rotates visible variant to index 0.
  const onPickSubjectVariant = useCallback(
    (stepIdx: number, variantIdx: number) => {
      const step = strategy.sequence[stepIdx];
      if (!step) return;
      const variants = step.subject_variants;
      if (variantIdx <= 0 || variantIdx >= variants.length) return;
      const reordered = [
        variants[variantIdx]!,
        ...variants.filter((_, i) => i !== variantIdx),
      ] as typeof variants;
      const nextSequence = strategy.sequence.map((s, i) =>
        i === stepIdx ? { ...s, subject_variants: reordered } : s,
      );
      const next = { ...strategy, sequence: nextSequence };
      setStrategy(next);
      void saveStrategy(next);
    },
    [strategy, saveStrategy],
  );

  // --- Step filter + URL sync -----------------------------------------------
  const setStepBoth = useCallback(
    (idx: number | null) => {
      setStepFilter(idx);
      onStepChange(idx);
    },
    [onStepChange],
  );

  // --- Render preview --------------------------------------------------------
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
      // No per-contact overrides — globals only.
    };
  }, [selectedContact, selectedAccount]);

  const rendered: RenderedEmail[] = useMemo(() => {
    if (!renderCtx) return [];
    return renderSequence(strategy, renderCtx);
  }, [strategy, renderCtx]);

  const visibleRendered =
    stepFilter === null ? rendered : rendered.filter((_, i) => i === stepFilter);

  // Tokens referenced in the currently-visible step(s) only.
  const visibleTokenKeys = useMemo(() => {
    const keys = new Set<string>();
    const steps =
      stepFilter === null
        ? strategy.sequence
        : strategy.sequence.filter((_, i) => i === stepFilter);
    for (const s of steps) {
      const regex = /\{\{\s*token\.([a-z][a-z0-9_]*)\s*\}\}/gi;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(s.body_template)) !== null) {
        keys.add(m[1]!);
      }
      for (const variant of s.subject_variants) {
        while ((m = regex.exec(variant)) !== null) {
          keys.add(m[1]!);
        }
      }
    }
    return keys;
  }, [strategy, stepFilter]);

  const visibleTokens = strategy.tokens.filter((t) =>
    visibleTokenKeys.has(t.key),
  );
  const dynTokens = useMemo(() => dynamicTokenKeys(strategy), [strategy]);

  // Truncated rationale display.
  const rationale = useMemo(
    () => truncate(strategy.framework_rationale, RATIONALE_MAX),
    [strategy.framework_rationale],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header: framework + rationale (≤500 chars) + Create and Launch CTA */}
      <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface/40 px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 shrink-0 rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-accent">
            {strategy.framework}
          </span>
          <div className="min-w-0">
            <p className="text-[12px] leading-relaxed text-foreground">
              {rationale}
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
          <SaveIndicator saving={saving} savedAt={savedAt} error={saveError} />
        </div>
      </div>

      {/* Step chip filter + contact dropdown */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface/40 p-1">
          <StepChip
            active={stepFilter === null}
            label="All"
            onClick={() => setStepBoth(null)}
          />
          {strategy.sequence.map((s, i) => (
            <StepChip
              key={s.step}
              active={stepFilter === i}
              label={`${s.step}`}
              onClick={() => setStepBoth(i)}
            />
          ))}
        </div>

        <label className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono uppercase tracking-[0.08em]">
            Preview for
          </span>
          <select
            value={selectedContactId ?? ""}
            onChange={(e) => setSelectedContactId(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground outline-none focus:border-accent"
          >
            {contacts.length === 0 && <option value="">No contacts</option>}
            {contacts.map((c) => {
              const name =
                [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email;
              return (
                <option key={c.id} value={c.id}>
                  {name}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {/* Preview pane */}
      {!renderCtx ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/20 px-6 py-10 text-center text-[12px] text-muted-foreground">
          Pick a contact to preview their cadence.
        </div>
      ) : visibleRendered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/20 px-6 py-10 text-center text-[12px] text-muted-foreground">
          No steps to show.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface/20">
          <div className="flex flex-col divide-y divide-border">
            {visibleRendered.map((r, i) => {
              const stepIdx =
                stepFilter === null ? i : (stepFilter as number);
              const step = strategy.sequence[stepIdx]!;
              return (
                <StepPreviewRow
                  key={r.step}
                  rendered={r}
                  subjectVariants={step.subject_variants}
                  onPickVariant={(variantIdx) =>
                    onPickSubjectVariant(stepIdx, variantIdx)
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Token editor (scoped to visible steps) */}
      {visibleTokens.length > 0 && (
        <div className="rounded-lg border border-border bg-surface/20">
          <div className="border-b border-border px-4 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Tokens in {stepFilter === null ? "this cadence" : "this step"}
            </span>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {visibleTokens.map((t) => {
              const isDynamic = dynTokens.has(t.key);
              const rules = strategy.personalization_rules.filter(
                (r) => r.token_key === t.key,
              );
              return (
                <div key={t.key} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center gap-2">
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
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t.description}
                  </p>
                  <div>
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      Default value
                    </div>
                    <InlineInput
                      value={t.default_value}
                      disabled={saving}
                      onChange={(v) => onEditTokenDefault(t.key, v)}
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
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StepChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-sm px-2.5 py-1 text-[11px] font-medium font-mono uppercase tracking-[0.06em] transition",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function StepPreviewRow({
  rendered,
  subjectVariants,
  onPickVariant,
}: {
  rendered: RenderedEmail;
  subjectVariants: string[];
  onPickVariant: (idx: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <Mail className="h-3 w-3 text-muted-foreground" />
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Step {rendered.step} · Day {rendered.day_offset}
          {rendered.is_thread && " · threaded"}
        </span>
        {subjectVariants.length > 1 && (
          <div className="ml-auto flex items-center gap-1 rounded-sm border border-border bg-background p-0.5">
            {subjectVariants.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPickVariant(i)}
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-sm font-mono text-[10px] uppercase transition",
                  i === 0
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={`Variant ${String.fromCharCode(65 + i)}`}
              >
                {String.fromCharCode(65 + i)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="text-[12px] font-medium text-foreground">
        {rendered.subject || (
          <span className="italic text-muted-foreground">(no subject)</span>
        )}
      </div>
      <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-foreground">
        {rendered.body}
      </pre>
      {rendered.warnings.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">
          {rendered.warnings.join(" · ")}
        </div>
      )}
    </div>
  );
}

function SaveIndicator({
  saving,
  savedAt,
  error,
}: {
  saving: boolean;
  savedAt: number | null;
  error: string | null;
}) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!savedAt) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(t);
  }, [savedAt]);

  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        saving
      </span>
    );
  }
  if (error) {
    return (
      <span
        title={error}
        className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-destructive"
      >
        <AlertCircle className="h-3 w-3" />
        save error
      </span>
    );
  }
  if (flash) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-success">
        <Check className="h-3 w-3" />
        saved
      </span>
    );
  }
  return null;
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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

