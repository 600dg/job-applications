import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Application } from "@/lib/applications";
import type { ApplicationEmailAnalysis, GmailMessageSummary } from "@/lib/email-suggestions";

export const GMAIL_AI_ANALYSIS_VERSION = 1;
const MAX_MESSAGES_PER_BATCH = 10;
const MAX_BODY_CHARACTERS = 6_000;

const reviewSchema = z.object({
  reviews: z
    .array(
      z.object({
        messageId: z.string().min(1).max(200),
        applications: z
          .array(
            z.object({
              company: z.string().min(2).max(160),
              role: z.string().min(2).max(200),
              status: z.enum(["Applied", "Assessment", "Interview", "Offer", "Rejected"]),
              confidence: z.number().int().min(0).max(100),
              evidence: z.string().min(2).max(400),
            }),
          )
          .max(12),
      }),
    )
    .max(MAX_MESSAGES_PER_BATCH),
});

export type EmailReviewInput = {
  message: GmailMessageSummary;
  knownApplications: Application[];
  earlierThreadMessages: GmailMessageSummary[];
};

export async function verifyApplicationEmailsWithAi(inputs: EmailReviewInput[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI verification is required before Gmail can update applications.");

  const client = new OpenAI({ apiKey });
  const batches = chunk(inputs, MAX_MESSAGES_PER_BATCH);
  const reviewed = await Promise.all(
    batches.map(async (batch) => {
      const response = await client.responses.parse({
        model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
        input: [
          {
            role: "system",
            content:
              "You verify whether Gmail messages prove that the user has a real job application or candidacy. Return one review for every supplied message using its exact messageId. Return an empty applications array when the message is a job alert, recommendation, search result, newsletter, list of open roles, keyword match, networking message, recruiter marketing, or otherwise does not prove the user applied or is in a hiring process. Never turn skills, keywords, suggested roles, links, footers, or unrelated job titles into applications. Extract multiple applications only when the email explicitly identifies distinct applications or candidacies. Copy company and role names from the email exactly rather than rewriting them. Use knownApplications and earlierThreadMessages only to resolve the company and role for the current status email. Status and evidence must come from the current message, not earlier thread context. If context contains several applications, require the current message to identify which role it concerns. Never invent a company, role, status, or application. Evidence must be a short exact quote from the current subject, snippet, or body that proves the status. Use confidence 90 or higher only when the application and status are explicit; uncertainty must produce no application.",
          },
          {
            role: "user",
            content: JSON.stringify(
              batch.map(({ message, knownApplications, earlierThreadMessages }) => ({
                messageId: message.id,
                threadId: message.threadId,
                subject: message.subject,
                sender: message.sender,
                snippet: message.snippet,
                body: message.bodyText?.slice(0, MAX_BODY_CHARACTERS) ?? "",
                knownApplications: knownApplications.map((application) => ({
                  id: application.id,
                  company: application.company,
                  role: application.role,
                  status: application.status,
                })),
                earlierThreadMessages: earlierThreadMessages.map((threadMessage) => ({
                  subject: threadMessage.subject,
                  sender: threadMessage.sender,
                  snippet: threadMessage.snippet,
                  body: threadMessage.bodyText?.slice(0, 2_000) ?? "",
                })),
              })),
            ),
          },
        ],
        text: { format: zodTextFormat(reviewSchema, "gmail_application_reviews") },
      });
      if (!response.output_parsed) throw new Error("OpenAI did not return Gmail application reviews.");
      return response.output_parsed.reviews;
    }),
  );

  const inputMap = new Map(inputs.map((input) => [input.message.id, input]));
  const reviews = new Map<string, ApplicationEmailAnalysis[]>();
  for (const review of reviewed.flat()) {
    const input = inputMap.get(review.messageId);
    if (!input || reviews.has(review.messageId)) continue;
    reviews.set(
      review.messageId,
      review.applications
        .filter((application) => isGroundedApplication(application, input))
        .map((application) => ({
          company: application.company.trim(),
          role: application.role.trim(),
          detectedStatus: application.status,
          confidence: application.confidence,
          reason: `OpenAI verified this application from explicit email evidence: “${application.evidence.trim()}”`,
        })),
    );
  }
  for (const input of inputs) if (!reviews.has(input.message.id)) reviews.set(input.message.id, []);
  return reviews;
}

function isGroundedApplication(
  application: z.infer<typeof reviewSchema>["reviews"][number]["applications"][number],
  input: EmailReviewInput,
) {
  if (application.confidence < 90) return false;
  const currentSource = normalize(
    `${input.message.subject}\n${input.message.sender}\n${input.message.snippet}\n${input.message.bodyText ?? ""}`,
  );
  const evidence = normalize(application.evidence);
  if (!evidence || !currentSource.includes(evidence)) return false;

  const knownMatch = input.knownApplications.find(
    (known) =>
      normalize(known.company) === normalize(application.company) &&
      normalize(known.role) === normalize(application.role),
  );
  if (knownMatch && input.knownApplications.length === 1) return true;
  const contextSource = normalize(
    `${currentSource}\n${input.earlierThreadMessages
      .map((message) => `${message.subject}\n${message.sender}\n${message.snippet}\n${message.bodyText ?? ""}`)
      .join("\n")}`,
  );
  return contextSource.includes(normalize(application.company)) && contextSource.includes(normalize(application.role));
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&amp;|&/g, " and ")
    .replace(/&nbsp;/g, " ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );
}
