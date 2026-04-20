// Shared sequence-runtime types. Strings align with the `sequence_state` and
// `send_status` enums declared in 20260420120000_add_sequence_runtime.sql.

export const SEQUENCE_STATES = [
  "not_started",
  "active",
  "completed",
  "exited_replied",
  "exited_bounced",
  "exited_complained",
  "exited_failed",
] as const;
export type SequenceState = (typeof SEQUENCE_STATES)[number];

export const SEND_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "opened",
  "bounced",
  "complained",
  "replied",
  "failed",
] as const;
export type SendStatus = (typeof SEND_STATUSES)[number];

export type EmailSendRow = {
  id: string;
  campaign_id: string;
  contact_id: string;
  step: number;
  message_id: string | null;
  subject: string;
  body_rendered: string;
  status: SendStatus;
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  created_at: string;
  updated_at: string;
};

export const EXIT_REASONS = {
  replied: "exited_replied",
  bounced: "exited_bounced",
  complained: "exited_complained",
  failed: "exited_failed",
} as const satisfies Record<string, SequenceState>;

export type ExitReason = keyof typeof EXIT_REASONS;

// Resend webhook event shapes we care about.
export type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.opened"
  | "email.bounced"
  | "email.complained"
  | "email.replied";

export type ResendEvent = {
  type: ResendEventType;
  data: {
    email_id?: string;
    // delivery: message id + recipient
    to?: string[];
    from?: string;
    subject?: string;
  };
  created_at?: string;
};

// Our own hook token scheme — one hook per (contact, step). Reply/bounce/etc.
// are all routed to the same hook; the workflow reads the payload to decide.
export function contactHookToken(contactId: string, step: number): string {
  return `seq:${contactId}:${step}`;
}

export type HookPayload =
  | { kind: "reply" }
  | { kind: "bounce" }
  | { kind: "complaint" }
  | { kind: "delivered" }
  | { kind: "opened" };

// Demo-mode compression: "1 day" → 30 seconds.
export const DEMO_DAY_SECONDS = 30;
