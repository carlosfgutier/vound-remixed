export const CAMPAIGN_GOALS = [
  { id: "book_call", label: "Book a sales call / intro meeting" },
  { id: "demo", label: "Drive a product demo request" },
  { id: "qualify", label: "Qualify the lead (ICP fit, budget, timeline)" },
  { id: "signup", label: "Drive product signup or free trial" },
  { id: "reengage", label: "Re-engage cold or stalled prospects" },
  { id: "event", label: "Drive event or webinar registration" },
  { id: "expansion", label: "Expansion / upsell to an existing account" },
  { id: "content", label: "Gated content download" },
  { id: "other", label: "Other" },
] as const;

export type CampaignGoalId = (typeof CAMPAIGN_GOALS)[number]["id"];

export const MAX_RANKED_GOALS = 3;
