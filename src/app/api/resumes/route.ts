import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { and, desc, eq, ne } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { getDb } from "@/db";
import { resumes } from "@/db/schema";
import { analyzeAtsReadiness } from "@/lib/ats-analysis";
import { requireUserId } from "@/lib/auth";
import { listResumes, toSavedResume } from "@/lib/resume-data";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validPdf(bytes: Uint8Array) {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

export async function GET() {
  return Response.json({ resumes: await listResumes() });
}

export async function POST(request: Request) {
  const ownerId = await requireUserId();
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.type !== "application/pdf") {
    return Response.json({ error: "Upload a PDF résumé." }, { status: 400 });
  }

  if (!file.size || file.size > MAX_PDF_SIZE) {
    return Response.json({ error: "The PDF must be between 1 byte and 10 MB." }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validPdf(bytes)) {
    return Response.json({ error: "This file does not appear to be a valid PDF." }, { status: 400 });
  }

  let extractedText = "";
  let pageCount = 0;
  try {
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    extractedText = result.text.trim();
    pageCount = result.totalPages;
    await pdf.destroy();
  } catch {
    return Response.json(
      { error: "We could not read this PDF. Try exporting it again from your document editor." },
      { status: 422 },
    );
  }

  const parseStatus = extractedText.split(/\s+/).filter(Boolean).length >= 50 ? "ready" : "needs_ocr";
  const atsAnalysis = analyzeAtsReadiness(extractedText, pageCount);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const db = getDb();
  const existing = await db.select({ id: resumes.id }).from(resumes).where(eq(resumes.ownerId, ownerId)).limit(1);
  const blob = await put("resumes/" + ownerId + "/" + randomUUID() + "-" + safeName, Buffer.from(bytes), {
    access: "private",
    contentType: "application/pdf",
  });

  try {
    const [resume] = await db
      .insert(resumes)
      .values({
        ownerId,
        fileName: file.name,
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        contentType: file.type,
        size: file.size,
        isPrimary: existing.length === 0,
        pageCount,
        parseStatus,
        extractedText,
        atsScore: atsAnalysis.score,
        atsAnalysis,
      })
      .returning();

    return Response.json({ resume: toSavedResume(resume) }, { status: 201 });
  } catch (error) {
    await del(blob.url);
    throw error;
  }
}

export async function PATCH(request: Request) {
  const ownerId = await requireUserId();
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (!body || typeof body.id !== "string" || !UUID_PATTERN.test(body.id)) {
    return Response.json({ error: "A résumé id is required." }, { status: 400 });
  }

  const db = getDb();
  const [owned] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, body.id), eq(resumes.ownerId, ownerId)))
    .limit(1);
  if (!owned) return Response.json({ error: "Résumé not found." }, { status: 404 });

  await db
    .update(resumes)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(and(eq(resumes.ownerId, ownerId), ne(resumes.id, body.id)));
  const [resume] = await db
    .update(resumes)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(and(eq(resumes.id, body.id), eq(resumes.ownerId, ownerId)))
    .returning();

  return Response.json({ resume: toSavedResume(resume) });
}

export async function DELETE(request: Request) {
  const ownerId = await requireUserId();
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID_PATTERN.test(id)) return Response.json({ error: "A valid résumé id is required." }, { status: 400 });

  const db = getDb();
  const [owned] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.ownerId, ownerId)))
    .limit(1);
  if (!owned) return Response.json({ error: "Résumé not found." }, { status: 404 });

  await del(owned.blobUrl);
  await db.delete(resumes).where(and(eq(resumes.id, id), eq(resumes.ownerId, ownerId)));

  if (owned.isPrimary) {
    const [replacement] = await db
      .select({ id: resumes.id })
      .from(resumes)
      .where(eq(resumes.ownerId, ownerId))
      .orderBy(desc(resumes.createdAt))
      .limit(1);
    if (replacement) {
      await db
        .update(resumes)
        .set({ isPrimary: true, updatedAt: new Date() })
        .where(and(eq(resumes.id, replacement.id), eq(resumes.ownerId, ownerId)));
    }
  }

  return Response.json({ ok: true });
}
