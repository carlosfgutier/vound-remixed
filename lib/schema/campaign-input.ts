import { z } from "zod";
import { CAMPAIGN_GOALS, MAX_RANKED_GOALS } from "@/lib/campaign-goals";

const goalIds = CAMPAIGN_GOALS.map((g) => g.id) as [string, ...string[]];

export const rankedGoalSchema = z.object({
  id: z.enum(goalIds),
  customLabel: z.string().trim().min(2).max(80).optional(),
});

export const contactRecordSchema = z
  .record(z.string(), z.string())
  .refine((r) => typeof r.email === "string" && r.email.includes("@"), {
    message: "Every record must include an email column.",
  });

export const contactsSchema = z.object({
  mode: z.enum(["csv", "individual", "webhook", "http"]),
  records: z.array(contactRecordSchema).min(1, "Add at least one contact."),
  detectedColumns: z.array(z.string()).min(1),
});

export const campaignInputSchema = z
  .object({
    campaignType: z
      .string()
      .trim()
      .min(10, "A sentence or two is plenty — tell us what this campaign is."),
    audience: z
      .string()
      .trim()
      .min(10, "A sentence or two is plenty — describe the audience."),
    goals: z
      .array(rankedGoalSchema)
      .min(1, "Pick at least one goal.")
      .max(MAX_RANKED_GOALS, `Max ${MAX_RANKED_GOALS} goals.`),
    contacts: contactsSchema,
  })
  .superRefine((val, ctx) => {
    val.goals.forEach((g, i) => {
      if (g.id === "other" && !g.customLabel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["goals", i, "customLabel"],
          message: "Describe your custom goal.",
        });
      }
    });
  });

export type CampaignInput = z.infer<typeof campaignInputSchema>;
export type RankedGoal = z.infer<typeof rankedGoalSchema>;
export type ContactsInput = z.infer<typeof contactsSchema>;
