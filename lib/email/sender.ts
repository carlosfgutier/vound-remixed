import "server-only";

export type SendInput = {
  to: string;
  subject: string;
  // For now we send plaintext; Resend accepts `text` or `html`.
  text: string;
  // Optional threading: message id to set as In-Reply-To so Resend keeps the
  // thread.
  thread_parent_message_id?: string | null;
  // Custom from address (per-campaign). Falls back to MAIL_FROM env var.
  from?: string;
};

export type SendResult =
  | { ok: true; message_id: string; mock: boolean }
  | { ok: false; error: string };

const RESEND_URL = "https://api.resend.com/emails";

function isTruthyEnv(v: string | undefined): boolean {
  return typeof v === "string" && v.trim() !== "" && v !== "0" && v !== "false";
}

/**
 * Sends an email. When `demoMode` is true OR RESEND_API_KEY is missing, this
 * mocks the send, logs, and returns a synthetic `mock_<uuid>` message id.
 *
 * We keep the surface tiny (one function) so the rest of the workflow code
 * stays identical in both modes.
 */
export async function sendEmail(
  input: SendInput,
  demoMode: boolean,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const hasKey = isTruthyEnv(apiKey);

  if (demoMode || !hasKey) {
    const id = `mock_${crypto.randomUUID()}`;
    console.log("[sender:mock]", {
      id,
      to: input.to,
      subject: input.subject,
      preview: input.text.slice(0, 120),
      reason: !hasKey ? "no-resend-key" : "demo-mode",
    });
    return { ok: true, message_id: id, mock: true };
  }

  const from = input.from ?? process.env.MAIL_FROM ?? "vbound@localhost";

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    };
    const body: Record<string, unknown> = {
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    };
    if (input.thread_parent_message_id) {
      // Resend threading: we include headers the user's inbox uses to thread.
      body.headers = {
        "In-Reply-To": input.thread_parent_message_id,
        References: input.thread_parent_message_id,
      };
    }

    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` };
    }

    const json = (await res.json()) as { id?: string };
    if (!json.id) return { ok: false, error: "Resend returned no id" };
    return { ok: true, message_id: json.id, mock: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown sender error",
    };
  }
}
