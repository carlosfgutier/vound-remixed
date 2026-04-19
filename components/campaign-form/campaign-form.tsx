"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "./text-field";
import { GoalsField } from "./goals-field";
import { ContactsSection } from "./contacts-section";
import {
  CAMPAIGN_TYPE_EXAMPLES,
  AUDIENCE_EXAMPLES,
} from "@/lib/example-prompts";
import {
  campaignInputSchema,
  type ContactsInput,
  type RankedGoal,
} from "@/lib/schema/campaign-input";
import { defineEnrichmentAction } from "@/app/(dashboard)/campaigns/new/actions";

type FieldErrors = Partial<Record<string, string>>;

export function CampaignForm() {
  const [campaignType, setCampaignType] = useState("");
  const [audience, setAudience] = useState("");
  const [goals, setGoals] = useState<RankedGoal[]>([]);
  const [contacts, setContacts] = useState<ContactsInput | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const candidate = {
      campaignType,
      audience,
      goals,
      contacts: contacts ?? undefined,
    };

    const parsed = campaignInputSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
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

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <TextField
        label="What kind of campaign is this?"
        htmlFor="campaignType"
        value={campaignType}
        onChange={setCampaignType}
        placeholder="e.g., Follow-up to people who visited our booth at KubeCon — we want to book intro calls with the ones who showed real interest."
        examples={CAMPAIGN_TYPE_EXAMPLES}
        error={errors.campaignType}
      />

      <TextField
        label="Tell us a bit about your audience"
        htmlFor="audience"
        value={audience}
        onChange={setAudience}
        placeholder="e.g., 143 attendees who scanned their badge at our booth. We have name, email, and company — nothing else."
        examples={AUDIENCE_EXAMPLES}
        error={errors.audience}
      />

      <GoalsField value={goals} onChange={setGoals} error={errors.goals} />

      <ContactsSection
        value={contacts}
        onChange={setContacts}
        error={errors.contacts ?? errors["contacts.records"]}
      />

      {serverError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-[12px] text-destructive">
          {serverError}
        </div>
      )}

      <div className="flex justify-end border-t border-border pt-6">
        <Button type="submit" variant="primary" disabled={isPending}>
          Continue to enrichment spec
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
}

function GeneratingPlaceholder() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-surface/20 px-6 py-12 text-center">
      <div className="relative flex h-10 w-10 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent/60" />
        <Sparkles className="absolute h-3.5 w-3.5 text-accent" />
      </div>
      <div>
        <div className="text-sm font-medium text-foreground">
          Designing the enrichment spec
        </div>
        <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
          vBound is reading your brief and deciding what to research about each
          account and contact. This takes a few seconds.
        </p>
      </div>
    </div>
  );
}
