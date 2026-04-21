export type PhaseId =
  | "details"
  | "loading"
  | "preview"
  | "sequence";

export type Phase = {
  id: PhaseId;
  index: number;
  label: string;
  description: string;
};

export const PHASES: readonly Phase[] = [
  { id: "details",  index: 1, label: "Details",  description: "Campaign brief + sources" },
  { id: "loading",  index: 2, label: "Loading",  description: "Researching & drafting" },
  { id: "preview",  index: 3, label: "Preview",  description: "Review fields, data, emails" },
  { id: "sequence", index: 4, label: "Sequence", description: "Schedule & send" },
] as const;

export function phaseHref(phase: PhaseId, campaignId?: string): string | null {
  if (phase === "details") return "/campaigns/new";
  if (!campaignId) return null;
  switch (phase) {
    case "loading":  return `/campaigns/${campaignId}/loading`;
    case "preview":  return `/campaigns/${campaignId}/preview?tab=fields`;
    case "sequence": return `/campaigns/${campaignId}/sequence`;
  }
}
