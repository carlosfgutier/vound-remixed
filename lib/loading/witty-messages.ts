export const WITTY_MESSAGES: readonly string[] = [
  "Stalking LinkedIn profiles.",
  "Reading the room.",
  "Color-coding spreadsheets.",
  "Scrolling through earnings calls.",
  "Decoding job titles.",
  "Finding the decision-maker.",
  "Checking who went to whose wedding.",
  "Separating buyers from browsers.",
  "Rewriting subject lines for the fourth time.",
  "Calling in a favor from Clearbit.",
  "Looking for the soft spot.",
  "Workshopping a good opener.",
  "Counting employees on LinkedIn.",
  "Translating jargon to English.",
  "Googling them, but in a professional way.",
  "Assembling a dossier.",
  "Reading between the lines of a funding announcement.",
  "Finding the warmest path in.",
  "Picking the right day of the week to send.",
  "Getting the tone exactly right.",
] as const;

/**
 * Shuffle a copy of WITTY_MESSAGES so each Loading screen feels fresh.
 */
export function shuffledWittyMessages(): string[] {
  const arr = [...WITTY_MESSAGES];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
