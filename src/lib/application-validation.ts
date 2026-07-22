import { z } from "zod";
import { APPLICATION_STATUSES } from "@/lib/applications";

export const applicationInputSchema = z.object({
  company: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(160),
  status: z.enum(APPLICATION_STATUSES),
  appliedDate: z.iso.date(),
  source: z.string().trim().min(1).max(160),
  salary: z.string().trim().max(160),
  jobUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => !value || /^https?:\/\//i.test(value), "Use a full HTTP or HTTPS job URL."),
  jobDescription: z.string().trim().max(30_000),
  notes: z.string().trim().max(5000),
});
