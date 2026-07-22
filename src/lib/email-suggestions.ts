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

export type GmailImportReview = {
  id: string;
  gmailMessageId: string;
  subject: string;
  sender: string;
  receivedAt: string;
  excerpt: string;
  applications: ApplicationEmailAnalysis[];
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
      /\bconditional offer\b/i,
      /\bemployment offer\b/i,
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
      /\bnot (?:be )?progressing (?:your|the) application\b/i,
      /\bno longer (?:be )?under consideration\b/i,
      /\bdecided not to (?:move|proceed) forward\b/i,
      /\bpursu(?:e|ing) other candidates\b/i,
      /\bfilled (?:the|this) (?:role|position)\b/i,
      /\b(?:your application|you were) (?:was |were )?(?:not successful|unsuccessful)\b/i,
      /\bwill not (?:be )?progress(?:ing)?\b/i,
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
      /\bskills? (?:test|evaluation)\b/i,
      /\bonline (?:test|evaluation|exercise)\b/i,
      /\bpre-employment (?:test|assessment)\b/i,
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
      /\bphone screen\b/i,
      /\bscreening (?:call|conversation|interview)\b/i,
      /\binterview availability\b/i,
      /\bmeet (?:our|the) team\b/i,
      /\binvit(?:e|ed|ation) (?:you )?to (?:an? )?interview\b/i,
    ],
    reason: "Interview or scheduling language was found.",
  },
  {
    status: "Applied",
    patterns: [
      /\bapplication (?:has been |was )?received\b/i,
      /\bapplications? (?:have|has) been received\b/i,
      /\breceived your applications?\b/i,
      /\bthank you for (?:applying|your (?:job )?(?:recent )?application)\b/i,
      /\bapplication confirmation\b/i,
      /\byour applications?\b/i,
      /\bconfirm(?:ing)? (?:the )?receipt of your (?:application|resume)\b/i,
      /\bapplication acknowledgement\b/i,
      /\bapplication (?:was )?submitted\b/i,
      /\bapplications? (?:were|was) submitted\b/i,
      /\bsuccessfully (?:submitted|completed) your application\b/i,
      /\bthank you for your interest in\b/i,
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
const ATS_SENDER_PATTERN = /@[^>\s]*(?:ashbyhq|dayforce|greenhouse|icims|lever|myworkday|smartrecruiters)[^>\s]*/i;
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
    .replace(/\s+via\s+(?:ashby|dayforce|greenhouse|icims|lever|smartrecruiters|workday)\s*$/i, "")
    .replace(/\s+(?:talent acquisition|recruitment|recruiting|hiring|careers?|jobs?)(?: team)?$/i, "")
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
    !/\b(?:job\s+title|position\s+title|position|role)\s*:/i.test(value) &&
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

function extractPrimaryCompanyAndRole(message: GmailMessageSummary) {
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
    subject.match(/application (?:confirmation|acknowledgement)\s+(?:at|from|with)\s+(.+?)(?:[.!]|$)/i)?.[1] ??
    subject.match(/your applications?\s+(?:at|with|to)\s+(.+?)(?:[.!]|$)/i)?.[1] ??
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

function extractCompanyAndRoles(message: GmailMessageSummary) {
  const primary = extractPrimaryCompanyAndRole(message);
  const subject = decodeHtml(message.subject).replace(/\s+/g, " ").trim();
  const content = decodeHtml(message.bodyText || message.snippet);
  const combined = `${subject}\n${content}`;
  const labeledCompany = content.match(
    /(?:^|\n)\s*(?:company|organization|employer)\s*[:\-–—]\s*([^\n|•;]{2,100})/im,
  )?.[1];
  const fallbackCompany = primary.company || cleanCompany(labeledCompany ?? "") || senderCompany(message.sender);
  const candidates: Array<{ company: string; role: string; confidence: number }> = [];

  function add(company: string, role: string, confidence: number) {
    const cleanedCompany = cleanCompany(company);
    const cleanedRole = cleanRole(role);
    if (!cleanedCompany || !isPlausibleRole(cleanedRole)) return;
    if (
      candidates.some(
        (candidate) =>
          companyAliases(candidate.company).some((alias) => companyAliases(cleanedCompany).includes(alias)) &&
          roleMatchScore(candidate.role, cleanedRole) >= 0.9,
      )
    )
      return;
    candidates.push({ company: cleanedCompany, role: cleanedRole, confidence });
  }

  if (primary.company && primary.role) add(primary.company, primary.role, primary.confidence);

  const roleAtCompany =
    /(?:application (?:for|to)|appl(?:ied|ying) (?:for|to)|interest in)\s+(?:the\s+)?(?:[A-Z]?\d+(?:-WD)?\s+)?([^.!?\n|•]{2,120}?)\s+(?:role\s+|position\s+)?at\s+([^.!?\n|•]{2,100})(?=[.!?\n|•]|$)/gi;
  for (const match of combined.matchAll(roleAtCompany)) add(match[2], match[1], 96);

  const repeatedRole =
    /(?:^|[\n|•])\s*(?:your\s+)?(?:application (?:for|to)|appl(?:ied|ying) for)\s+(?:the\s+)?([^.!?\n|•]{2,120})(?=[.!?\n|•]|$)/gim;
  for (const match of combined.matchAll(repeatedRole)) {
    const role = match[1].replace(/\s+(?:role|position)\s+at\s+.+$/i, "").replace(/\s+at\s+.+$/i, "");
    add(fallbackCompany, role, 94);
  }

  const labeledRole = /(?:^|[\n|•])\s*(?:job\s+title|position\s+title|position|role)\s*[:\-–—]\s*([^\n|•;]{2,100})/gim;
  for (const match of combined.matchAll(labeledRole)) add(fallbackCompany, match[1], 94);

  const requisitionRole =
    /(?:^|[\n|•])\s*(?:requisition\s*(?:id|number)?\s*[:\-–—]?\s*)?(?:R-?\d{3,}|REQ-?\d+|\d+-WD)\s*[:\-–—]\s*([^\n|•;]{2,100})/gim;
  for (const match of combined.matchAll(requisitionRole)) add(fallbackCompany, match[1], 94);

  const repeatedApplication = /(?:^|[\n|•])\s*(?:application|job)\s*(?:\d+)?\s*[:\-–—]\s*([^\n|•;]{2,100})/gim;
  for (const match of combined.matchAll(repeatedApplication)) add(fallbackCompany, match[1], 92);

  return candidates.slice(0, 12);
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

export function isPotentialApplicationEmail(message: GmailMessageSummary) {
  const source = messageContent(message);
  return (
    !NON_JOB_PATTERNS.some((pattern) => pattern.test(source)) &&
    (JOB_CONTEXT_PATTERN.test(source) || ATS_SENDER_PATTERN.test(message.sender))
  );
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

export function analyzeApplicationEmails(message: GmailMessageSummary): ApplicationEmailAnalysis[] {
  if (!isPotentialApplicationEmail(message)) return [];
  const signal = detectApplicationStatus(message);
  if (!signal) return [];
  const extractedApplications = extractCompanyAndRoles(message);

  return extractedApplications.map((extracted) => ({
    company: extracted.company,
    role: extracted.role,
    detectedStatus: signal.status,
    confidence: extracted.confidence,
    reason: `${signal.reason} The company and role were extracted from the application email.`,
  }));
}

export function analyzeApplicationEmail(message: GmailMessageSummary): ApplicationEmailAnalysis | null {
  return analyzeApplicationEmails(message)[0] ?? null;
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

export function findMatchingApplications(
  message: GmailMessageSummary,
  applications: Application[],
  analyses = analyzeApplicationEmails(message),
) {
  const matches = new Map<string, Application>();
  for (const analysis of analyses) {
    const application = findMatchingApplication(message, applications, analysis);
    if (application) matches.set(application.id, application);
  }

  const searchable = normalize(messageContent(message));
  for (const application of applications) {
    const companyFound = companyAliases(application.company).some((alias) => searchable.includes(alias));
    const roleFound = roleTokens(application.role).filter((token) => searchable.includes(token)).length;
    const materialRoleTokens = roleTokens(application.role).length;
    if (companyFound && materialRoleTokens > 0 && roleFound / materialRoleTokens >= 0.75) {
      matches.set(application.id, application);
    }
  }
  return Array.from(matches.values());
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
