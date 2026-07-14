export type FitBand = "Strong fit" | "Competitive fit" | "Stretch fit" | "Limited fit" | "Needs more detail";

export type FitAnalysis = {
  score: number;
  band: FitBand;
  action: string;
  summary: string;
  matchedQualifications: string[];
  gaps: string[];
  keywords: string[];
  suggestions: string[];
  signalsConsidered: number;
  coverage: number;
};

type Qualification = {
  label: string;
  aliases: string[];
  resumeAliases?: string[];
  weight: number;
};

const QUALIFICATIONS: Qualification[] = [
  { label: "Bachelor’s degree", aliases: ["bachelor's degree", "bachelors degree", "undergraduate degree", "university degree"], resumeAliases: ["bachelor of commerce", "bachelor's degree", "bachelors degree", "undergraduate degree"], weight: 4 },
  { label: "Canadian Securities Course", aliases: ["canadian securities course", "csc designation", "csc certification", "csc"], weight: 4 },
  { label: "Financial analysis", aliases: ["financial analysis", "financial analyst", "finance analysis"], weight: 4 },
  { label: "Financial modelling", aliases: ["financial modeling", "financial modelling", "valuation model", "financial models"], weight: 4 },
  { label: "Business analysis", aliases: ["business analysis", "business analyst", "business requirements"], weight: 4 },
  { label: "Data analysis", aliases: ["data analysis", "data analytics", "analytical insights", "quantitative analysis"], weight: 4 },
  { label: "Commercial real estate", aliases: ["commercial real estate", "real estate finance", "real estate lending"], resumeAliases: ["commercial real estate", "real estate sales", "real estate"], weight: 3 },
  { label: "Mortgage lending", aliases: ["mortgage lending", "mortgage underwriting", "mortgage credit", "mortgages"], weight: 3 },
  { label: "Banking", aliases: ["banking", "financial institution", "retail bank", "commercial bank"], weight: 3 },
  { label: "Wealth management", aliases: ["wealth management", "investment advisory", "portfolio management"], weight: 3 },
  { label: "Research", aliases: ["research", "market research", "industry research", "economic research"], weight: 3 },
  { label: "Excel", aliases: ["microsoft excel", "advanced excel", "excel"], weight: 3 },
  { label: "SQL", aliases: ["structured query language", "sql"], weight: 3 },
  { label: "Python", aliases: ["python"], weight: 3 },
  { label: "R", aliases: ["rstudio", "r programming", "r language"], resumeAliases: ["rstudio", "r programming", "r language", "r studio"], weight: 2 },
  { label: "Tableau", aliases: ["tableau"], weight: 3 },
  { label: "Bloomberg Terminal", aliases: ["bloomberg terminal", "bloomberg"], weight: 3 },
  { label: "SharePoint", aliases: ["sharepoint"], weight: 2 },
  { label: "Reporting and dashboards", aliases: ["dashboard", "reporting", "management reports", "data visualization"], resumeAliases: ["dashboard", "reporting", "reports", "data visualization", "tableau"], weight: 3 },
  { label: "Forecasting", aliases: ["forecasting", "financial forecast", "budgeting", "variance analysis"], weight: 3 },
  { label: "Requirements gathering", aliases: ["requirements gathering", "gather requirements", "business requirements", "requirements documentation"], weight: 3 },
  { label: "Process improvement", aliases: ["process improvement", "operational improvement", "workflow improvement", "continuous improvement"], weight: 3 },
  { label: "Stakeholder management", aliases: ["stakeholder management", "stakeholder engagement", "cross-functional stakeholders", "cross functional stakeholders"], weight: 3 },
  { label: "Client relationships", aliases: ["client relationship", "client management", "customer relationship", "relationship management"], resumeAliases: ["client relationship", "consultative sales", "client management", "relationship management"], weight: 3 },
  { label: "Presentation and communication", aliases: ["presentation skills", "written communication", "verbal communication", "communication skills", "present findings"], resumeAliases: ["presentations", "presentation", "communication", "consultative sales"], weight: 2 },
  { label: "Project management", aliases: ["project management", "manage projects", "project coordination"], weight: 3 },
  { label: "CPA", aliases: ["chartered professional accountant", "cpa designation", "cpa"], weight: 5 },
  { label: "CFA", aliases: ["chartered financial analyst", "cfa designation", "cfa"], weight: 5 },
  { label: "Master’s degree", aliases: ["master's degree", "masters degree", "mba", "graduate degree"], weight: 5 },
];

export const SAMPLE_PROFILE = `Bachelor of Commerce in Finance and Business Analytics.
Completed the Canadian Securities Course.
Quantitative and research experience at the Canada Revenue Agency, including data analysis, reporting, and communicating findings.
Real estate sales experience with client relationship management and consultative sales.
Tools: Microsoft Excel, SQL, Python, RStudio, Tableau, Bloomberg Terminal, and SharePoint.`;

export const SAMPLE_JOB_POSTING = `Senior Business Analyst — Commercial Banking

We are looking for a business analyst to support commercial banking and lending initiatives. The successful candidate will gather business requirements, analyze financial and operational data, build Excel reports and Tableau dashboards, and present findings to cross-functional stakeholders.

Qualifications:
- Bachelor's degree in finance, business, analytics, or a related field
- Experience with business analysis, financial analysis, and process improvement
- Advanced Excel and working knowledge of SQL
- Strong research, stakeholder management, and communication skills
- Commercial real estate or mortgage lending experience is an asset
- Canadian Securities Course completion is an asset`;

export function analyzeJobFit(resume: string, jobPosting: string): FitAnalysis {
  const normalizedResume = normalize(resume);
  const normalizedJob = normalize(jobPosting);
  const requirements = QUALIFICATIONS.filter((item) => hasAny(normalizedJob, item.aliases));
  const matched = requirements.filter((item) => hasAny(normalizedResume, item.resumeAliases ?? item.aliases));
  const missing = requirements.filter((item) => !matched.includes(item));
  const totalWeight = requirements.reduce((total, item) => total + item.weight, 0);
  const matchedWeight = matched.reduce((total, item) => total + item.weight, 0);
  const score = totalWeight ? Math.round((matchedWeight / totalWeight) * 100) : 0;
  const coverage = requirements.length ? Math.round((matched.length / requirements.length) * 100) : 0;
  const { band, action } = getRecommendation(score, requirements.length);
  const matchedLabels = matched.map((item) => item.label);
  const gapLabels = missing.map((item) => item.label);

  return {
    score,
    band,
    action,
    summary: buildSummary(matchedLabels, gapLabels, requirements.length),
    matchedQualifications: matchedLabels,
    gaps: gapLabels,
    keywords: requirements.map((item) => item.label),
    suggestions: buildSuggestions(matchedLabels, gapLabels),
    signalsConsidered: requirements.length,
    coverage,
  };
}

function normalize(value: string) {
  return ` ${value.toLowerCase().replace(/&/g, " and ").replace(/[’']/g, "").replace(/[^a-z0-9+#]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function hasAny(text: string, aliases: string[]) {
  return aliases.some((alias) => text.includes(` ${normalize(alias).trim()} `));
}

function getRecommendation(score: number, signalCount: number): { band: FitBand; action: string } {
  if (signalCount < 3) return { band: "Needs more detail", action: "Paste a more detailed job description before deciding." };
  if (score >= 80) return { band: "Strong fit", action: "Apply and tailor your strongest evidence to the role." };
  if (score >= 60) return { band: "Competitive fit", action: "Apply after addressing the most important gaps." };
  if (score >= 40) return { band: "Stretch fit", action: "Apply selectively if you can show adjacent experience." };
  return { band: "Limited fit", action: "Prioritize stronger matches unless the role is strategically valuable." };
}

function buildSummary(matches: string[], gaps: string[], signalCount: number) {
  if (signalCount < 3) return "The posting does not contain enough recognizable detail for a useful comparison.";
  const strongest = matches.slice(0, 3).join(", ");
  const mainGap = gaps.slice(0, 2).join(" and ");
  if (!matches.length) return "The profile does not yet show direct evidence for the qualifications detected in this posting.";
  if (!gaps.length) return `The profile shows evidence for every detected qualification, led by ${strongest}.`;
  return `The clearest alignment is ${strongest}. The main areas to validate or strengthen are ${mainGap}.`;
}

function buildSuggestions(matches: string[], gaps: string[]) {
  const suggestions = [
    "Mirror the posting’s exact terminology where it truthfully describes your experience.",
    "Add outcomes and scale—dollars, time saved, records analyzed, clients supported, or decisions influenced.",
  ];
  if (matches.length) suggestions.unshift(`Lead with evidence for ${matches.slice(0, 3).join(", ")}.`);
  if (gaps.length) suggestions.push(`Do not claim missing experience. Look for adjacent evidence related to ${gaps.slice(0, 3).join(", ")}, or address it briefly in your application.`);
  return suggestions;
}
