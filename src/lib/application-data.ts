import "server-only";

import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, userProfiles } from "@/db/schema";
import { SAMPLE_APPLICATIONS, type Application } from "@/lib/applications";
import { requireUserId } from "@/lib/auth";

function toApplication(row: typeof applications.$inferSelect): Application {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    location: row.location,
    status: row.status as Application["status"],
    appliedDate: row.appliedDate,
    source: row.source,
    salary: row.salary,
    jobUrl: row.jobUrl,
    jobDescription: row.jobDescription,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function seedWorkspace(ownerId: string) {
  const db = getDb();
  const created = await db
    .insert(userProfiles)
    .values({
      clerkUserId: ownerId,
      sampleDataSeeded: true,
    })
    .onConflictDoNothing()
    .returning({ clerkUserId: userProfiles.clerkUserId });

  if (!created.length) return;

  await db.insert(applications).values(
    SAMPLE_APPLICATIONS.map((application) => ({
      ownerId,
      company: application.company,
      role: application.role,
      location: application.location,
      status: application.status,
      appliedDate: application.appliedDate,
      source: application.source,
      salary: application.salary,
      jobUrl: application.jobUrl,
      jobDescription: application.jobDescription,
      notes: application.notes,
      updatedAt: new Date(application.updatedAt),
    })),
  );
}

export async function listApplications(): Promise<Application[]> {
  const ownerId = await requireUserId();
  await seedWorkspace(ownerId);

  const rows = await getDb()
    .select()
    .from(applications)
    .where(eq(applications.ownerId, ownerId))
    .orderBy(desc(applications.updatedAt), asc(applications.company));

  return rows.map(toApplication);
}

export { toApplication };
