export type Provider = {
  id: string;
  label: string;
  description?: string;
};

// Shared between the client-side providers grid and server components that
// need to render provider labels (e.g. the read-only Details snapshot).
// Kept in its own non-"use client" module so server components can import
// the raw array; importing from a "use client" module would cross the RSC
// boundary and reify the export as a reference, not a real array.
export const BUILT_IN_PROVIDERS: Provider[] = [
  { id: "salesforce", label: "Salesforce", description: "CRM of record" },
  { id: "hubspot", label: "HubSpot", description: "CRM + activity" },
  { id: "gong", label: "Gong", description: "Call intelligence" },
  { id: "granola", label: "Granola", description: "Meeting notes" },
  { id: "clearbit", label: "Clearbit", description: "Firmographics" },
  { id: "zoominfo", label: "Zoominfo", description: "Contact data" },
  { id: "clay", label: "Clay", description: "Enrichment graph" },
  { id: "smartlead", label: "Smartlead", description: "Send activity" },
];
