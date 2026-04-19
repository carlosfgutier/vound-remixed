export const CAMPAIGN_TYPE_EXAMPLES = [
  "Follow-up to people who visited our booth at KubeCon — we want to book intro calls with the ones who showed real interest.",
  "Re-engagement for free-tier users who signed up in Q1 but haven't deployed a project yet.",
  "Warm intro sequence to CTOs who liked our VP of Eng's recent LinkedIn post on edge middleware.",
] as const;

export const AUDIENCE_EXAMPLES = [
  "143 attendees who scanned their badge at our booth. We have name, email, and company from the badge scan — nothing else.",
  "About 2,400 free-tier signups. We know email, signup date, and whether they've pushed a deploy. Mostly solo devs and early-stage teams.",
  "Maybe 30 LinkedIn connections of our VP Eng who engaged with his edge middleware post. We only have their names and company from LinkedIn.",
] as const;
