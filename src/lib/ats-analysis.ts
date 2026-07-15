import type { AtsAnalysis, AtsCheck, AtsCheckStatus } from "@/lib/resumes";

const ACTION_VERBS = [
  "achieved",
  "analyzed",
  "built",
  "created",
  "delivered",
  "developed",
  "drove",
  "improved",
  "increased",
  "led",
  "managed",
  "optimized",
  "reduced",
  "streamlined",
];
const SKILLS = [
  "excel",
  "sql",
  "python",
  "r",
  "tableau",
  "power bi",
  "bloomberg",
  "sharepoint",
  "financial analysis",
  "data analysis",
  "research",
  "forecasting",
  "modelling",
  "modeling",
  "stakeholder",
  "client relationship",
  "project management",
];

function makeCheck(
  id: string,
  label: string,
  status: AtsCheckStatus,
  points: number,
  maxPoints: number,
  detail: string,
): AtsCheck {
  return { id, label, status, points, maxPoints, detail };
}

function ratioPoints(value: number, fullAt: number, maxPoints: number) {
  return Math.min(maxPoints, Math.round((value / fullAt) * maxPoints));
}

export function analyzeAtsReadiness(text: string, pageCount: number): AtsAnalysis {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const wordCount = normalized ? normalized.split(" ").length : 0;
  const checks: AtsCheck[] = [];

  const machinePoints = wordCount >= 150 ? 16 : ratioPoints(wordCount, 150, 16);
  checks.push(
    makeCheck(
      "readability",
      "Machine-readable text",
      machinePoints >= 14 ? "pass" : machinePoints >= 6 ? "warning" : "fail",
      machinePoints,
      16,
      machinePoints >= 14
        ? wordCount + " words were extracted successfully."
        : "Only " + wordCount + " words were extracted; this may be an image-only or highly designed PDF.",
    ),
  );

  const pagePoints = pageCount >= 1 && pageCount <= 2 ? 4 : pageCount === 3 ? 3 : pageCount > 3 ? 1 : 0;
  checks.push(
    makeCheck(
      "length",
      "Focused page length",
      pagePoints === 4 ? "pass" : pagePoints >= 1 ? "warning" : "fail",
      pagePoints,
      4,
      pageCount
        ? pageCount + (pageCount === 1 ? " page detected." : " pages detected.")
        : "No readable pages were detected.",
    ),
  );

  const contactSignals = [
    /@[\w.-]+\.[a-z]{2,}/i.test(normalized),
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(normalized),
    /linkedin\.com\/in\//i.test(normalized),
  ];
  const contactCount = contactSignals.filter(Boolean).length;
  const contactPoints = [0, 6, 10, 13][contactCount];
  checks.push(
    makeCheck(
      "contact",
      "Contact information",
      contactCount >= 2 ? "pass" : contactCount === 1 ? "warning" : "fail",
      contactPoints,
      13,
      contactCount + " of 3 common contact signals found (email, phone, LinkedIn).",
    ),
  );

  const headings = ["experience", "education", "skills", "summary", "certifications", "projects"];
  const foundHeadings = headings.filter((heading) => new RegExp("\\b" + heading + "\\b", "i").test(normalized));
  const headingPoints = ratioPoints(foundHeadings.length, 4, 20);
  checks.push(
    makeCheck(
      "headings",
      "Standard section headings",
      foundHeadings.length >= 4 ? "pass" : foundHeadings.length >= 2 ? "warning" : "fail",
      headingPoints,
      20,
      foundHeadings.length
        ? "Found: " + foundHeadings.join(", ") + "."
        : "Use recognizable headings such as Experience, Education, and Skills.",
    ),
  );

  const impactMatches = normalized.match(/(?:\$[\d,.]+|\b\d+(?:\.\d+)?%|\b\d+[+]?)\b/g) ?? [];
  const impactPoints = ratioPoints(impactMatches.length, 5, 12);
  checks.push(
    makeCheck(
      "impact",
      "Quantified impact",
      impactMatches.length >= 5 ? "pass" : impactMatches.length >= 2 ? "warning" : "fail",
      impactPoints,
      12,
      impactMatches.length + " measurable result" + (impactMatches.length === 1 ? "" : "s") + " detected.",
    ),
  );

  const detectedVerbs = ACTION_VERBS.filter((verb) => new RegExp("\\b" + verb + "\\b", "i").test(normalized));
  const verbPoints = ratioPoints(detectedVerbs.length, 5, 8);
  checks.push(
    makeCheck(
      "verbs",
      "Strong action language",
      detectedVerbs.length >= 5 ? "pass" : detectedVerbs.length >= 2 ? "warning" : "fail",
      verbPoints,
      8,
      detectedVerbs.length
        ? "Detected " + detectedVerbs.slice(0, 6).join(", ") + "."
        : "Start accomplishment bullets with specific action verbs.",
    ),
  );

  const detectedSkills = SKILLS.filter((skill) => lower.includes(skill));
  const skillsPoints = ratioPoints(detectedSkills.length, 7, 17);
  checks.push(
    makeCheck(
      "skills",
      "Searchable skills",
      detectedSkills.length >= 7 ? "pass" : detectedSkills.length >= 3 ? "warning" : "fail",
      skillsPoints,
      17,
      detectedSkills.length
        ? "Detected " + detectedSkills.slice(0, 8).join(", ") + "."
        : "Add a plain-text skills section with role-relevant tools and capabilities.",
    ),
  );

  const densityPoints =
    wordCount >= 300 && wordCount <= 1100 ? 10 : wordCount >= 150 && wordCount <= 1500 ? 6 : wordCount > 0 ? 2 : 0;
  checks.push(
    makeCheck(
      "density",
      "Readable content density",
      densityPoints === 10 ? "pass" : densityPoints >= 6 ? "warning" : "fail",
      densityPoints,
      10,
      wordCount + " total words detected.",
    ),
  );

  const score = checks.reduce((total, check) => total + check.points, 0);
  const band = wordCount < 50 ? "Low readability" : score >= 85 ? "Excellent" : score >= 70 ? "Good" : "Needs work";
  const suggestions = checks
    .filter((check) => check.status !== "pass")
    .sort((a, b) => b.maxPoints - b.points - (a.maxPoints - a.points))
    .slice(0, 4)
    .map((check) => check.detail);

  return { score, band, checks, suggestions, source: "local" };
}
