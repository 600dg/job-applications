"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { applicationInputSchema } from "@/lib/application-validation";
import { requireUserId } from "@/lib/auth";
import { toApplication } from "@/lib/application-data";
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from "@/lib/applications";
import { z } from "zod";

type ApplicationInput = Omit<Application, "id">;
type ActionResult = { ok: true; application: Application } | { ok: false; error: string };
type DeleteResult = { ok: true } | { ok: false; error: string };
const applicationIdSchema = z.uuid();
const applicationStatusSchema = z.enum(APPLICATION_STATUSES);

export async function createApplication(input: ApplicationInput): Promise<ActionResult> {
  const ownerId = await requireUserId();
  const parsed = applicationInputSchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Please check the application details and try again." };

  const [created] = await getDb().insert(applications).values({ ...parsed.data, ownerId }).returning();
  revalidatePath("/");
  return { ok: true, application: toApplication(created) };
}

export async function updateApplication(id: string, input: ApplicationInput): Promise<ActionResult> {
  const ownerId = await requireUserId();
  const parsedId = applicationIdSchema.safeParse(id);
  const parsed = applicationInputSchema.safeParse(input);

  if (!parsedId.success || !parsed.success) return { ok: false, error: "Please check the application details and try again." };

  const [updated] = await getDb().update(applications)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(applications.id, id), eq(applications.ownerId, ownerId)))
    .returning();

  if (!updated) return { ok: false, error: "Application not found." };
  revalidatePath("/");
  return { ok: true, application: toApplication(updated) };
}

export async function updateApplicationStatus(id: string, status: ApplicationStatus): Promise<ActionResult> {
  const ownerId = await requireUserId();
  const parsedId = applicationIdSchema.safeParse(id);
  const parsedStatus = applicationStatusSchema.safeParse(status);

  if (!parsedId.success || !parsedStatus.success) return { ok: false, error: "Please select a valid status." };

  const [updated] = await getDb().update(applications)
    .set({ status: parsedStatus.data, updatedAt: new Date() })
    .where(and(eq(applications.id, id), eq(applications.ownerId, ownerId)))
    .returning();

  if (!updated) return { ok: false, error: "Application not found." };
  revalidatePath("/");
  return { ok: true, application: toApplication(updated) };
}

export async function deleteApplication(id: string): Promise<DeleteResult> {
  const ownerId = await requireUserId();
  if (!applicationIdSchema.safeParse(id).success) return { ok: false, error: "Application not found." };
  const [deleted] = await getDb().delete(applications)
    .where(and(eq(applications.id, id), eq(applications.ownerId, ownerId)))
    .returning({ id: applications.id });

  if (!deleted) return { ok: false, error: "Application not found." };
  revalidatePath("/");
  return { ok: true };
}
