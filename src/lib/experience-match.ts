export type ExperienceMatch = "meets" | "close" | "below" | "unknown";

export type ExperienceAssessment = {
  requiredYears: number | null;
  requiredLabel: string | null;
  resumeYears: number | null;
  match: ExperienceMatch;
  preferredOnly: boolean;
  summary: string;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const YEAR_TOKEN = String.raw`(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)`;
const EXPERIENCE_PATTERN = new RegExp(
  String.raw`(?:minimum(?:\s+of)?|at\s+least)?\s*(${YEAR_TOKEN})(?:\s*(?:-|–|—|to)\s*(${YEAR_TOKEN}))?\s*\+?\s*(?:years?|yrs?)(?:\s+of)?[^.\n;]{0,80}(?:experience|background)`,
  "gi",
);

export function assessExperience(resume: string, jobText: string): ExperienceAssessment {
  const requirement = findExperienceRequirement(jobText);
  const resumeYears = estimateResumeYears(resume);

  if (!requirement) {
    return {
      requiredYears: null,
      requiredLabel: null,
      resumeYears,
      match: "unknown",
      preferredOnly: false,
      summary: "The available posting text does not state a clear years-of-experience requirement.",
    };
  }

  if (resumeYears === null) {
    return {
      ...requirement,
      resumeYears,
      match: "unknown",
      summary: `${requirement.requiredLabel}; the résumé dates do not provide enough detail for a reliable comparison.`,
    };
  }

  const gap = requirement.requiredYears - resumeYears;
  const match: ExperienceMatch = gap <= 0 ? "meets" : gap <= 1 ? "close" : "below";
  const resumeLabel = `${formatYears(resumeYears)} visible in the résumé`;
  const qualifier = requirement.preferredOnly ? "preferred" : "required";

  return {
    ...requirement,
    resumeYears,
    match,
    summary:
      match === "meets"
        ? `The posting asks for ${requirement.requiredLabel} (${qualifier}); ${resumeLabel}.`
        : match === "close"
          ? `The posting asks for ${requirement.requiredLabel} (${qualifier}); the résumé appears close at ${resumeLabel}.`
          : `The posting asks for ${requirement.requiredLabel} (${qualifier}); the résumé shows about ${resumeLabel}.`,
  };
}

export function applyExperienceAdjustment(score: number, assessment: ExperienceAssessment) {
  if (assessment.match === "below") {
    const penalty = assessment.preferredOnly ? 8 : 20;
    const cap = assessment.preferredOnly ? 72 : 55;
    return Math.min(Math.max(0, score - penalty), cap);
  }
  if (assessment.match === "close") {
    return Math.max(0, score - (assessment.preferredOnly ? 3 : 8));
  }
  return score;
}

function findExperienceRequirement(jobText: string) {
  const matches: Array<{
    requiredYears: number;
    requiredLabel: string;
    preferredOnly: boolean;
  }> = [];

  for (const match of jobText.matchAll(EXPERIENCE_PATTERN)) {
    const requiredYears = parseYearToken(match[1]);
    if (requiredYears === null) continue;
    const contextStart = Math.max(0, (match.index ?? 0) - 70);
    const contextEnd = Math.min(jobText.length, (match.index ?? 0) + match[0].length + 70);
    const context = jobText.slice(contextStart, contextEnd).toLowerCase();
    const preferredOnly = /\b(preferred|asset|nice to have|ideally)\b/.test(context);
    const rangeEnd = parseYearToken(match[2]);
    const requiredLabel =
      rangeEnd !== null
        ? `${requiredYears}–${rangeEnd} years of experience`
        : `${requiredYears}+ years of experience`;
    matches.push({ requiredYears, requiredLabel, preferredOnly });
  }

  if (!matches.length) return null;
  return matches.sort(
    (left, right) =>
      Number(left.preferredOnly) - Number(right.preferredOnly) || right.requiredYears - left.requiredYears,
  )[0];
}

function estimateResumeYears(resume: string) {
  const explicitClaims = Array.from(
    resume.matchAll(
      new RegExp(
        String.raw`\b(${YEAR_TOKEN})\s*\+?\s*(?:years?|yrs?)(?:\s+of)?[^.\n;]{0,60}(?:experience|background)\b`,
        "gi",
      ),
    ),
  )
    .map((match) => parseYearToken(match[1]))
    .filter((value): value is number => value !== null);
  if (explicitClaims.length) return Math.max(...explicitClaims);

  const intervals = extractDatedIntervals(resume);
  if (!intervals.length) return null;

  const merged = intervals
    .sort((left, right) => left[0] - right[0])
    .reduce<Array<[number, number]>>((result, interval) => {
      const previous = result.at(-1);
      if (!previous || interval[0] > previous[1]) result.push([...interval]);
      else previous[1] = Math.max(previous[1], interval[1]);
      return result;
    }, []);
  const months = merged.reduce((total, [start, end]) => total + Math.max(0, end - start), 0);
  return months >= 6 ? Math.round((months / 12) * 2) / 2 : null;
}

function extractDatedIntervals(resume: string): Array<[number, number]> {
  const month =
    "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const dateRange = new RegExp(
    String.raw`\b(?:(${month})\s+)?((?:19|20)\d{2})\s*(?:-|–|—|to)\s*(?:(?:(${month})\s+)?((?:19|20)\d{2})|present|current|now)\b`,
    "gi",
  );
  const now = new Date();
  const intervals: Array<[number, number]> = [];

  for (const match of resume.matchAll(dateRange)) {
    const startYear = Number(match[2]);
    const startMonth = monthNumber(match[1]) ?? 0;
    const endIsPresent = !match[4];
    const endYear = endIsPresent ? now.getUTCFullYear() : Number(match[4]);
    const endMonth = endIsPresent ? now.getUTCMonth() + 1 : (monthNumber(match[3]) ?? 11) + 1;
    const start = startYear * 12 + startMonth;
    const end = endYear * 12 + endMonth;
    if (end > start && end - start <= 50 * 12) intervals.push([start, end]);
  }
  return intervals;
}

function parseYearToken(value: string | undefined) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  const numeric = Number.parseInt(normalized, 10);
  return Number.isFinite(numeric) ? numeric : (NUMBER_WORDS[normalized] ?? null);
}

function monthNumber(value: string | undefined) {
  if (!value) return null;
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
    value.slice(0, 3).toLowerCase(),
  );
}

function formatYears(years: number) {
  return Number.isInteger(years) ? `${years} years` : `${years.toFixed(1)} years`;
}
