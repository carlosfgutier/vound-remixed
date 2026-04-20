import type {
  EmailRule,
  EmailStep,
  EmailStrategy,
  EmailToken,
} from "@/lib/schema/email-strategy";

/**
 * Data bag for a single contact. Shape matches what the DB returns, plus
 * an optional joined account. Overrides are applied last and can replace
 * any resolved token value for this specific contact.
 */
export type RenderContext = {
  contact: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    contact_linkedin: string | null;
    job_title: string | null;
    seniority: string | null;
    department: string | null;
    contact_country: string | null;
    custom_data: Record<string, unknown> | null;
  };
  account: {
    id: string | null;
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
  } | null;
  /** Per-contact overrides, keyed by token key. */
  overrides?: Record<string, string>;
};

export type RenderedEmail = {
  step: number;
  day_offset: number;
  is_thread: boolean;
  subject: string;
  subject_variants: string[];
  body: string;
  cta: string;
  goal: string;
  /** Which tokens were used (for UI highlighting). */
  resolved_tokens: Record<string, string>;
  /** Warnings: references that couldn't be resolved. */
  warnings: string[];
};

// --- path resolution --------------------------------------------------------

/**
 * Resolves a dotted path against the render context.
 * Supported paths:
 *   - contact standard: first_name, email, etc.
 *   - account standard: company.name (alias), industry_iso, etc., and company_*
 *   - custom.<key>       → contact.custom_data[key]
 *   - account.custom.<k> → account.custom_data[k]
 * Returns null if missing.
 */
export function resolvePath(ctx: RenderContext, path: string): unknown {
  const p = path.trim();

  if (p === "company.name") return ctx.account?.company_name ?? null;
  if (p === "company.domain") return ctx.account?.company_domain ?? null;
  if (p === "company.website") return ctx.account?.company_website ?? null;
  if (p === "company.description") return ctx.account?.company_description ?? null;
  if (p === "company.linkedin") return ctx.account?.company_linkedin ?? null;

  if (p.startsWith("account.custom.")) {
    const key = p.slice("account.custom.".length);
    return ctx.account?.custom_data?.[key] ?? null;
  }
  if (p.startsWith("custom.")) {
    const key = p.slice("custom.".length);
    return ctx.contact.custom_data?.[key] ?? null;
  }

  // account-level standard
  if (p.startsWith("account.")) {
    const key = p.slice("account.".length);
    const a = ctx.account as Record<string, unknown> | null;
    return a?.[key] ?? null;
  }

  // contact-level standard: look on contact first, then bare account fields.
  const c = ctx.contact as unknown as Record<string, unknown>;
  if (p in c) return c[p];
  const a = ctx.account as unknown as Record<string, unknown> | null;
  if (a && p in a) return a[p];

  return null;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function normalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ").toLowerCase();
  return String(value).toLowerCase();
}

// --- predicate evaluation ---------------------------------------------------

type ParsedPredicate =
  | { kind: "has"; path: string }
  | { kind: "truthy"; path: string }
  | { kind: "eq"; path: string; literal: string }
  | { kind: "contains"; path: string; literal: string }
  | { kind: "in"; path: string; options: string[] };

function parsePredicate(raw: string): ParsedPredicate | null {
  const expr = raw.trim();
  const m = /^([a-z_]+)\s*\((.*)\)\s*$/i.exec(expr);
  if (!m) return null;
  const fn = m[1]!.toLowerCase();
  const argsRaw = m[2]!;

  if (fn === "has" || fn === "truthy") {
    return { kind: fn, path: argsRaw.trim() };
  }

  if (fn === "eq" || fn === "contains") {
    // path, 'literal'
    const splitAt = argsRaw.indexOf(",");
    if (splitAt === -1) return null;
    const path = argsRaw.slice(0, splitAt).trim();
    const lit = unquote(argsRaw.slice(splitAt + 1).trim());
    if (lit === null) return null;
    return { kind: fn, path, literal: lit };
  }

  if (fn === "in") {
    // path, 'a'|'b'|'c'
    const splitAt = argsRaw.indexOf(",");
    if (splitAt === -1) return null;
    const path = argsRaw.slice(0, splitAt).trim();
    const rest = argsRaw.slice(splitAt + 1).trim();
    const parts = rest.split("|").map((p) => unquote(p.trim()));
    if (parts.some((p) => p === null)) return null;
    return { kind: "in", path, options: parts as string[] };
  }

  return null;
}

function unquote(s: string): string | null {
  if (s.length < 2) return null;
  const first = s[0];
  const last = s[s.length - 1];
  if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
    return s.slice(1, -1);
  }
  return null;
}

export function evaluatePredicate(ctx: RenderContext, predicate: string): boolean {
  const parsed = parsePredicate(predicate);
  if (!parsed) return false;

  switch (parsed.kind) {
    case "has":
      return !isEmpty(resolvePath(ctx, parsed.path));
    case "truthy": {
      const v = resolvePath(ctx, parsed.path);
      if (isEmpty(v)) return false;
      if (v === false || v === 0) return false;
      return true;
    }
    case "eq":
      return normalize(resolvePath(ctx, parsed.path)) === parsed.literal.toLowerCase();
    case "contains": {
      const v = resolvePath(ctx, parsed.path);
      if (Array.isArray(v)) {
        return v.map((x) => String(x).toLowerCase()).includes(parsed.literal.toLowerCase());
      }
      return normalize(v).includes(parsed.literal.toLowerCase());
    }
    case "in": {
      const v = normalize(resolvePath(ctx, parsed.path));
      return parsed.options.map((o) => o.toLowerCase()).includes(v);
    }
  }
}

// --- token resolution -------------------------------------------------------

export function resolveTokens(
  strategy: EmailStrategy,
  ctx: RenderContext,
): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const token of strategy.tokens) {
    // 1. Find first matching rule (rules are in strategy order).
    const rule = strategy.personalization_rules.find(
      (r) => r.token_key === token.key && evaluatePredicate(ctx, r.when),
    );
    let value = rule ? rule.value : token.default_value;

    // 2. Per-contact override wins if present.
    const override = ctx.overrides?.[token.key];
    if (typeof override === "string" && override.trim() !== "") {
      value = override;
    }

    resolved[token.key] = value;
  }

  return resolved;
}

// --- template substitution --------------------------------------------------

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function substitute(
  template: string,
  strategyTokens: Record<string, string>,
  ctx: RenderContext,
  warnings: string[],
): string {
  return template.replace(VAR_RE, (_match, path: string) => {
    if (path.startsWith("token.")) {
      const key = path.slice("token.".length);
      if (key in strategyTokens) return strategyTokens[key]!;
      warnings.push(`Unknown strategist token: ${key}`);
      return "";
    }
    const value = resolvePath(ctx, path);
    if (isEmpty(value)) {
      warnings.push(`Missing value for {{${path}}}`);
      return "";
    }
    return String(value);
  });
}

// --- public render functions ------------------------------------------------

export function renderStep(
  strategy: EmailStrategy,
  step: EmailStep,
  ctx: RenderContext,
): RenderedEmail {
  const warnings: string[] = [];
  const resolved = resolveTokens(strategy, ctx);
  const subject_variants = step.subject_variants.map((s) =>
    substitute(s, resolved, ctx, warnings),
  );
  const subject = subject_variants[0] ?? "";
  const body = substitute(step.body_template, resolved, ctx, warnings);
  return {
    step: step.step,
    day_offset: step.day_offset,
    is_thread: step.is_thread,
    subject,
    subject_variants,
    body,
    cta: step.cta,
    goal: step.goal,
    resolved_tokens: resolved,
    warnings,
  };
}

export function renderSequence(
  strategy: EmailStrategy,
  ctx: RenderContext,
): RenderedEmail[] {
  return strategy.sequence.map((step) => renderStep(strategy, step, ctx));
}

// --- helpers for UI ---------------------------------------------------------

/** Extract all `{{path}}` references in a template in order. */
export function extractTemplateVars(template: string): string[] {
  const out: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(VAR_RE.source, "g");
  while ((match = re.exec(template)) !== null) {
    out.push(match[1]!);
  }
  return out;
}

/** Token keys that are actually dynamic (have at least one rule targeting them). */
export function dynamicTokenKeys(strategy: EmailStrategy): Set<string> {
  const keys = new Set<string>();
  for (const rule of strategy.personalization_rules) {
    keys.add(rule.token_key);
  }
  return keys;
}

export type { EmailStep, EmailRule, EmailToken };
