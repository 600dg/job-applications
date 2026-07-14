import type { Application, ApplicationStatus } from "@/lib/applications";

export type EmailUpdateSuggestion = {
  id: string;
  applicationId: string;
  company: string;
  role: string;
  subject: string;
  sender: string;
  receivedAt: string;
  excerpt: string;
  detectedStatus: ApplicationStatus;
  confidence: number;
  reason: string;
};

export type GmailMessageSummary = {
  id: string;
  threadId: string;
  subject: string;
  sender: string;
  receivedAt: Date;
  snippet: string;
};

export type ClassifiedEmail = GmailMessageSummary & {
  applicationId: string;
  detectedStatus: ApplicationStatus;
  confidence: number;
  reason: string;
};

const STATUS_SIGNALS: Array<{ status: ApplicationStatus; patterns: RegExp[]; reason: string }> = [
  { status: "Offer", patterns: [/\boffer of employment\b/i, /\bpleased to (?:extend|offer)\b/i, /\bjob offer\b/i], reason: "Offer language was found in the message." },
  { status: "Rejected", patterns: [/\bnot moving forward\b/i, /\bother candidates\b/i, /\bwill not be proceeding\b/i, /\bregret to inform\b/i, /\bposition has been filled\b/i], reason: "Rejection language was found in the message." },
  { status: "Interview", patterns: [/\binterview\b/i, /\bschedule (?:a|your) (?:call|conversation)\b/i, /\bmeet with (?:the|our) (?:team|hiring manager)\b/i], reason: "Interview or scheduling language was found." },
  { status: "Assessment", patterns: [/\bassessment\b/i, /\btechnical (?:test|challenge)\b/i, /\bcase stud(?:y|ies)\b/i, /\bcomplete (?:the|this) test\b/i], reason: "An assessment or take-home task was detected." },
  { status: "Applied", patterns: [/\bapplication (?:has been )?received\b/i, /\bthank you for applying\b/i, /\bapplication confirmation\b/i], reason: "An application confirmation was detected." },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function companyAliases(company: string) {
  const normalized = normalize(company);
  const withoutSuffix = normalized.replace(/\b(?:inc|incorporated|ltd|limited|corp|corporation|company|co|bank)\b/g, "").replace(/\s+/g, " ").trim();
  return Array.from(new Set([normalized, withoutSuffix].filter((value) => value.length >= 3)));
}

export function classifyApplicationEmail(message: GmailMessageSummary, applications: Application[]): ClassifiedEmail | null {
  const searchable = normalize(message.subject + " " + message.sender + " " + message.snippet);
  const application = applications.find((item) => companyAliases(item.company).some((alias) => searchable.includes(alias)));
  if (!application) return null;

  const source = message.subject + " " + message.snippet;
  const signal = STATUS_SIGNALS.find((item) => item.patterns.some((pattern) => pattern.test(source)));
  if (!signal || signal.status === application.status) return null;

  const strongMatch = companyAliases(application.company).some((alias) => normalize(message.subject + " " + message.sender).includes(alias));
  return {
    ...message,
    applicationId: application.id,
    detectedStatus: signal.status,
    confidence: strongMatch ? 94 : 84,
    reason: signal.reason + " It was matched to " + application.company + ".",
  };
}
