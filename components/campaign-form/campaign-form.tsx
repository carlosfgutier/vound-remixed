"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { TextField } from "./text-field";
import { GoalsField } from "./goals-field";
import { ContactsSection } from "./contacts-section";
import { ProvidersGrid } from "./providers-grid";
import { WizardShell } from "./wizard-shell";
import {
  campaignInputSchema,
  type ContactsInput,
  type RankedGoal,
} from "@/lib/schema/campaign-input";
import { defineEnrichmentAction } from "@/app/(dashboard)/campaigns/new/actions";

type FieldErrors = Partial<Record<string, string>>;
type StepId = "brief" | "contacts" | "providers";

const STEPS = [
  { id: "brief" as const, label: "Brief" },
  { id: "contacts" as const, label: "Contacts" },
  { id: "providers" as const, label: "Sources" },
];

export function CampaignForm() {
  const [step, setStep] = useState<StepId>("brief");
  const [campaignType, setCampaignType] = useState("");
  const [audience, setAudience] = useState("");
  const [goals, setGoals] = useState<RankedGoal[]>([]);
  const [contacts, setContacts] = useState<ContactsInput | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const briefReady =
    campaignType.trim().length >= 10 &&
    audience.trim().length >= 10 &&
    goals.length >= 1;
  const contactsReady = Boolean(contacts && contacts.records.length > 0);

  const handleSubmit = () => {
    setErrors({});
    setServerError(null);

    const candidate = {
      campaignType,
      audience,
      goals,
      contacts: contacts ?? undefined,
      providers,
    };

    const parsed = campaignInputSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      // Hop back to the earliest step with an error.
      const firstKey = Object.keys(next)[0] ?? "";
      if (firstKey.startsWith("contacts")) setStep("contacts");
      else if (firstKey === "campaignType" || firstKey === "audience" || firstKey.startsWith("goals"))
        setStep("brief");
      return;
    }

    startTransition(async () => {
      // On success this server action calls `redirect()` and never returns.
      const result = await defineEnrichmentAction(parsed.data);
      if (result && !result.ok) setServerError(result.error);
    });
  };

  if (isPending) {
    return <GeneratingPlaceholder />;
  }

  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const isLast = stepIdx === STEPS.length - 1;

  const goNext = () => {
    if (step === "brief") setStep("contacts");
    else if (step === "contacts") setStep("providers");
  };
  const goBack = () => {
    if (step === "contacts") setStep("brief");
    else if (step === "providers") setStep("contacts");
  };

  return (
    <WizardShell
      steps={STEPS}
      currentStep={step}
      heading={
        step === "brief"
          ? "To start, tell us about your campaign."
          : step === "contacts"
            ? "Who should we reach?"
            : "Where should we look?"
      }
      subheading={
        step === "brief"
          ? "Three questions. Keep it short — we can infer the rest."
          : step === "contacts"
            ? "Pick how you'd like to bring contacts in."
            : "Select the sources we should pull signal from during research."
      }
      onBack={stepIdx > 0 ? goBack : undefined}
      onNext={goNext}
      onSubmit={handleSubmit}
      submitLabel="Submit"
      isLast={isLast}
      nextDisabled={
        (step === "brief" && !briefReady) ||
        (step === "contacts" && !contactsReady)
      }
      submitDisabled={!briefReady || !contactsReady}
    >
      {step === "brief" && (
        <div className="space-y-6">
          <TextField
            label="What kind of campaign is this?"
            htmlFor="campaignType"
            value={campaignType}
            onChange={setCampaignType}
            placeholder="e.g., Follow-up to people who visited our booth at KubeCon — we want to book intro calls with the ones who showed real interest."
            error={errors.campaignType}
          />
          <TextField
            label="Tell us a bit about your audience"
            htmlFor="audience"
            value={audience}
            onChange={setAudience}
            placeholder="e.g., 143 attendees who scanned their badge at our booth. We have name, email, and company — nothing else."
            error={errors.audience}
          />
          <GoalsField value={goals} onChange={setGoals} error={errors.goals} />
        </div>
      )}

      {step === "contacts" && (
        <ContactsSection
          value={contacts}
          onChange={setContacts}
          error={errors.contacts ?? errors["contacts.records"]}
        />
      )}

      {step === "providers" && (
        <ProvidersGrid value={providers} onChange={setProviders} />
      )}

      {serverError && (
        <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-[12px] text-destructive">
          {serverError}
        </div>
      )}
    </WizardShell>
  );
}

function GeneratingPlaceholder() {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-surface/20 px-6 py-12 text-center">
      <div className="relative flex h-10 w-10 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent/60" />
        <Sparkles className="absolute h-3.5 w-3.5 text-accent" />
      </div>
      <div>
        <div className="text-sm font-medium text-foreground">
          Designing the enrichment spec
        </div>
        <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
          vound is reading your brief and deciding what to research about each
          account and contact. This takes a few seconds.
        </p>
      </div>
    </div>
  );
}
