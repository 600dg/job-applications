import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { resumes } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import type { SavedResume } from "@/lib/resumes";

export function toSavedResume(row: typeof resumes.$inferSelect): SavedResume {
  return {
    id: row.id,
    fileName: row.fileName,
    size: row.size,
    isPrimary: row.isPrimary,
    pageCount: row.pageCount,
    parseStatus: row.parseStatus as SavedResume["parseStatus"],
    extractedText: row.extractedText,
    atsScore: row.atsScore,
    atsAnalysis: row.atsAnalysis,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listResumes(): Promise<SavedResume[]> {
  const ownerId = await requireUserId();
  const rows = await getDb().select().from(resumes)
    .where(eq(resumes.ownerId, ownerId))
    .orderBy(desc(resumes.isPrimary), desc(resumes.createdAt));

  return rows.map(toSavedResume);
}
