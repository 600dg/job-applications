import { z } from "zod";
import { APPLICATION_STATUSES } from "@/lib/applications";

export const applicationInputSchema = z.object({
  company: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(160),
  status: z.enum(APPLICATION_STATUSES),
  appliedDate: z.iso.date(),
  source: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(5000),
});
