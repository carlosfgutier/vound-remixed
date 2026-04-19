export type PhaseId =
  | "input"
  | "fields"
  | "enrichment"
  | "emails"
  | "sequence"
  | "report";

export type Phase = {
  id: PhaseId;
  index: number;
  label: string;
  description: string;
};

export const PHASES: readonly Phase[] = [
  { id: "input",      index: 1, label: "Input",      description: "Campaign brief + contacts" },
  { id: "fields",     index: 2, label: "Fields",     description: "AI-defined enrichment spec" },
  { id: "enrichment", index: 3, label: "Enrichment", description: "Research accounts & contacts" },
  { id: "emails",     index: 4, label: "Emails",     description: "Draft personalized copy" },
  { id: "sequence",   index: 5, label: "Sequence",   description: "Schedule & send" },
  { id: "report",     index: 6, label: "Report",     description: "Results & insights" },
] as const;

export function phaseHref(phase: PhaseId, campaignId?: string): string | null {
  if (phase === "input") return "/campaigns/new";
  if (!campaignId) return null;
  switch (phase) {
    case "fields":     return `/campaigns/${campaignId}`;
    case "enrichment": return `/campaigns/${campaignId}/enrichment`;
    case "emails":     return `/campaigns/${campaignId}/emails`;
    case "sequence":   return `/campaigns/${campaignId}/sequence`;
    case "report":     return `/campaigns/${campaignId}/report`;
  }
}
