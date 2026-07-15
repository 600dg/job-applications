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
  bodyText?: string;
};

export type ApplicationEmailAnalysis = {
  company: string;
  role: string;
  detectedStatus: ApplicationStatus;
  confidence: number;
  reason: string;
};

export type ClassifiedEmail = GmailMessageSummary & {
  applicationId: string;
  detectedStatus: ApplicationStatus;
  confidence: number;
  reason: string;
};

const STATUS_SIGNALS: Array<{ status: ApplicationStatus; patterns: RegExp[]; reason: string }> = [
  {
    status: "Offer",
    patterns: [
      /\boffer of employment\b/i,
      /\bpleased to (?:extend|offer)\b/i,
      /\bjob offer\b/i,
      /\bcongratulations.{0,80}\boffer\b/i,
    ],
    reason: "Offer language was found in the message.",
  },
  {
    status: "Rejected",
    patterns: [
      /\bnot (?:be )?moving forward\b/i,
      /\bother candidates\b/i,
      /\bwill not be proceeding\b/i,
      /\bregret to inform\b/i,
      /\bposition has been filled\b/i,
      /\bgoing in a direction\b/i,
      /\bnot (?:been )?selected\b/i,
      /\bunable to (?:move|proceed) forward\b/i,
    ],
    reason: "Rejection language was found in the message.",
  },
  {
    status: "Assessment",
    patterns: [
      /\bassessment\b/i,
      /\btechnical (?:test|challenge)\b/i,
      /\bcase stud(?:y|ies)\b/i,
      /\bcomplete (?:the|this|your) test\b/i,
      /\btake-home\b/i,
    ],
    reason: "An assessment or take-home task was detected.",
  },
  {
    status: "Interview",
    patterns: [
      /\binterview\b/i,
      /\bschedule (?:a|your) (?:call|conversation)\b/i,
      /\bmeet with (?:the|our) (?:team|hiring manager)\b/i,
      /\brecruiter (?:call|screen)\b/i,
    ],
    reason: "Interview or scheduling language was found.",
  },
  {
    status: "Applied",
    patterns: [
      /\bapplication (?:has been |was )?received\b/i,
      /\breceived your application\b/i,
      /\bthank you for (?:applying|your (?:job )?(?:recent )?application)\b/i,
      /\bapplication confirmation\b/i,
      /\bconfirm(?:ing)? (?:the )?receipt of your (?:application|resume)\b/i,
      /\bapplication acknowledgement\b/i,
    ],
    reason: "An application confirmation was detected.",
  },
];

const NON_JOB_PATTERNS = [
  /\breal(?:ty|tor| estate)\b/i,
  /\bbrokerage\b/i,
  /\bregistered offer\b/i,
  /\boffer presentation\b/i,
  /\blisting agents?\b/i,
  /\bpurchase contracts?\b/i,
  /\brental application\b/i,
  /\btenant(?:s| application)?\b/i,
];

const JOB_CONTEXT_PATTERN =
  /\b(?:job|career|candidate|hiring|position|role|resume|employment|recruit(?:er|ing|ment)?|assessment|interview|application)\b/i;
const ROLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "grad",
  "new",
  "of",
  "opportunity",
  "position",
  "role",
  "the",
]);

function decodeHtml(value: string) {
  return value
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalize(value: string) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanCompany(value: string) {
  return decodeHtml(value)
    .replace(/[|].*$/, "")
    .replace(/\s+(?:recruitment|recruiting|careers?|jobs?)$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:–—-]+|[\s:–—,.;!-]+$/g, "")
    .trim();
}

function cleanRole(value: string) {
  return decodeHtml(value)
    .split(/\s+\/\s+/)[0]
    .replace(/^\s*(?:R\d+|\d+-WD)\s+/i, "")
    .replace(/\s*\(\s*[A-Z]+_\d+\s*\)\s*$/i, "")
    .replace(/\s*[,–—-]\s*J?\d[\w-]*\s*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:–—-]+|[\s:–—,.;!-]+$/g, "")
    .trim();
}

function isPlausibleRole(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  return (
    value.length >= 2 &&
    value.length <= 100 &&
    words.length <= 16 &&
    !/\b(?:application review|candidate applications|recruitment process|what to expect|log in anytime)\b/i.test(value)
  );
}

function senderCompany(sender: string) {
  const displayName = sender.includes("<") ? sender.slice(0, sender.indexOf("<")) : "";
  const cleanedDisplay = cleanCompany(displayName.replace(/^['"]|['"]$/g, ""));
  if (cleanedDisplay && !/^(?:greenhouse|hirevue invitation|notifications?|workday)$/i.test(cleanedDisplay))
    return cleanedDisplay;

  const email = sender.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+)/i)?.[0] ?? "";
  const local = email.split("@")[0];
  if (local && !/^(?:me|no-?reply|notify|notifications?|careers?|help\.candidate)$/i.test(local))
    return cleanCompany(local);

  const domain = email.split("@")[1]?.split(".")[0] ?? "";
  if (
    domain &&
    !/^(?:ashbyhq|dayforce|gmail|greenhouse|icims|lever|myworkday|outlook|smartrecruiters)$/i.test(domain)
  ) {
    return domain.length <= 4 ? domain.toUpperCase() : cleanCompany(domain);
  }
  return "";
}

function extractCompanyAndRole(message: GmailMessageSummary) {
  const subject = decodeHtml(message.subject).replace(/\s+/g, " ").trim();
  const content = decodeHtml(message.bodyText || message.snippet)
    .replace(/\s+/g, " ")
    .trim();
  const combined = `${subject} ${content}`;

  const subjectAtMatch = subject.match(
    /(?:your application for (?:our |the role of |the position of )?|thank you for applying to )(?:\d+-WD\s+)?(.+?)\s+(?:role\s+)?at\s+(.+?)(?:[.!]|$)/i,
  );
  if (subjectAtMatch)
    return { company: cleanCompany(subjectAtMatch[2]), role: cleanRole(subjectAtMatch[1]), confidence: 98 };

  const interestSubject = subject.match(/^thank you for your interest in\s+(.+?)\s*:\s*(?:\d+-WD\s+)?(.+?)(?:[.!]|$)/i);
  if (interestSubject)
    return { company: cleanCompany(interestSubject[1]), role: cleanRole(interestSubject[2]), confidence: 98 };

  const contentAtMatch = combined.match(
    /(?:received|reviewing) your application for (?:our |the )?(.+?)\s+(?:role|position)\s+at\s+(.+?)(?:[.!]|,\s+(?:where|and|please)|$)/i,
  );
  if (contentAtMatch)
    return { company: cleanCompany(contentAtMatch[2]), role: cleanRole(contentAtMatch[1]), confidence: 96 };

  const acknowledgement = subject.match(/(?:job )?application acknowledgement\s*[-–—]\s*(.+?)(?:,\s*J\d[\w-]*)?$/i);
  if (acknowledgement)
    return { company: senderCompany(message.sender), role: cleanRole(acknowledgement[1]), confidence: 96 };

  const recentApplication = subject.match(
    /your recent (?:job )?application(?: for|\s*[-–—])\s*(.+?)(?:\s*[-–—]\s*\d+)?$/i,
  );
  if (recentApplication)
    return { company: senderCompany(message.sender), role: cleanRole(recentApplication[1]), confidence: 95 };

  const companyInSubject =
    subject.match(/thank you for applying (?:at|to)\s+(.+?)(?:[.!]|$)/i)?.[1] ??
    subject.match(/thank you for your application to\s+(.+?)(?:\s*[-–—]|$)/i)?.[1] ??
    subject.match(/application\s+(?:to|with)\s+(.+?)\s*[-–—]/i)?.[1] ??
    subject.match(/application update.{0,20}\b(?:at|with)\s+(.+?)$/i)?.[1];
  const companyAfterConfirmation = subject.match(/^thank you for your application\s*[-–—]\s*(.+)$/i)?.[1];
  const roleInContent =
    combined.match(
      /(?:apply(?:ing)? for|application for|apply to)\s+(?:the\s+)?(.+?)\s+(?:position|role|opportunity)\b/i,
    )?.[1] ??
    combined.match(/interest in\s+(?:the\s+)?([^.!?]{2,100}?)\s+(?:position|role|opportunity)\b/i)?.[1] ??
    combined.match(/(?:position|role)\s*[-:–—]\s*(.+?)(?:[.!]|$)/i)?.[1];
  if ((companyInSubject || companyAfterConfirmation) && roleInContent)
    return {
      company: cleanCompany(companyInSubject ?? companyAfterConfirmation ?? ""),
      role: cleanRole(roleInContent),
      confidence: 94,
    };

  const dashRole = subject.match(/(?:application|job application)[^–—-]*[–—-]\s*(.+)$/i)?.[1];
  const company = cleanCompany(companyInSubject ?? companyAfterConfirmation ?? senderCompany(message.sender));
  const role = cleanRole(roleInContent ?? dashRole ?? "");
  return { company, role, confidence: company && role ? 90 : 0 };
}

function companyAliases(company: string) {
  const normalized = normalize(company);
  const withoutSuffix = normalized
    .replace(/\b(?:inc|incorporated|ltd|limited|corp|corporation|company|co|bank|canada)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(new Set([normalized, withoutSuffix].filter((value) => value.length >= 2)));
}

function roleTokens(role: string) {
  return normalize(role)
    .split(" ")
    .filter((token) => token.length > 1 && !ROLE_STOP_WORDS.has(token));
}

function roleMatchScore(left: string, right: string) {
  const leftNormalized = normalize(left);
  const rightNormalized = normalize(right);
  if (!leftNormalized || !rightNormalized) return 0;
  if (
    leftNormalized === rightNormalized ||
    leftNormalized.includes(rightNormalized) ||
    rightNormalized.includes(leftNormalized)
  )
    return 1;
  const leftTokens = roleTokens(left);
  const rightTokens = new Set(roleTokens(right));
  if (!leftTokens.length || !rightTokens.size) return 0;
  return leftTokens.filter((token) => rightTokens.has(token)).length / Math.max(leftTokens.length, rightTokens.size);
}

function messageContent(message: GmailMessageSummary) {
  return decodeHtml(`${message.subject} ${message.sender} ${message.snippet} ${message.bodyText ?? ""}`);
}

export function detectApplicationStatus(message: GmailMessageSummary) {
  const source = messageContent(message);
  const terminalSignal = STATUS_SIGNALS.slice(0, 2).find((item) =>
    item.patterns.some((pattern) => pattern.test(source)),
  );
  if (terminalSignal) return terminalSignal;

  const subjectSignal = STATUS_SIGNALS.slice(2).find((item) =>
    item.patterns.some((pattern) => pattern.test(message.subject)),
  );
  if (subjectSignal) return subjectSignal;

  return STATUS_SIGNALS.slice(2).find((item) => item.patterns.some((pattern) => pattern.test(source))) ?? null;
}

export function analyzeApplicationEmail(message: GmailMessageSummary): ApplicationEmailAnalysis | null {
  const source = messageContent(message);
  if (NON_JOB_PATTERNS.some((pattern) => pattern.test(source)) || !JOB_CONTEXT_PATTERN.test(source)) return null;
  const signal = detectApplicationStatus(message);
  if (!signal) return null;
  const extracted = extractCompanyAndRole(message);
  if (!extracted.company || !extracted.role || extracted.company.length < 2 || !isPlausibleRole(extracted.role))
    return null;

  return {
    company: extracted.company,
    role: extracted.role,
    detectedStatus: signal.status,
    confidence: extracted.confidence,
    reason: `${signal.reason} The company and role were extracted from the application email.`,
  };
}

export function findMatchingApplication(
  message: GmailMessageSummary,
  applications: Application[],
  analysis = analyzeApplicationEmail(message),
) {
  if (analysis) {
    const companyMatches = applications.filter((application) =>
      companyAliases(application.company).some((alias) => companyAliases(analysis.company).includes(alias)),
    );
    const ranked = companyMatches
      .map((application) => ({ application, score: roleMatchScore(application.role, analysis.role) }))
      .sort((left, right) => right.score - left.score);
    if (ranked[0]?.score >= 0.75) return ranked[0].application;
    if (companyMatches.length === 1 && !analysis.role) return companyMatches[0];
    return null;
  }

  const searchable = normalize(messageContent(message));
  const matches = applications.filter((application) =>
    companyAliases(application.company).some((alias) => searchable.includes(alias)),
  );
  return matches.length === 1 ? matches[0] : null;
}

export function classifyApplicationEmail(
  message: GmailMessageSummary,
  applications: Application[],
): ClassifiedEmail | null {
  const signal = detectApplicationStatus(message);
  if (!signal) return null;
  const analysis = analyzeApplicationEmail(message);
  const application = findMatchingApplication(message, applications, analysis);
  if (!application || signal.status === application.status) return null;

  const strongRoleMatch = analysis ? roleMatchScore(application.role, analysis.role) >= 0.75 : false;
  return {
    ...message,
    applicationId: application.id,
    detectedStatus: signal.status,
    confidence: strongRoleMatch ? 96 : 90,
    reason: `${signal.reason} It was matched to ${application.company} - ${application.role}.`,
  };
}
