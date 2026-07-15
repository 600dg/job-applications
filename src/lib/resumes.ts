export type ResumeParseStatus = "ready" | "needs_ocr";

export type AtsCheckStatus = "pass" | "warning" | "fail";

export type AtsCheck = {
  id: string;
  label: string;
  status: AtsCheckStatus;
  points: number;
  maxPoints: number;
  detail: string;
};

export type AtsAnalysis = {
  score: number;
  band: "Excellent" | "Good" | "Needs work" | "Low readability";
  checks: AtsCheck[];
  suggestions: string[];
  source?: "local" | "ai";
  analyzedAt?: string;
  model?: string;
};

export type SavedResume = {
  id: string;
  fileName: string;
  size: number;
  isPrimary: boolean;
  pageCount: number;
  parseStatus: ResumeParseStatus;
  extractedText: string;
  atsScore: number;
  atsAnalysis: AtsAnalysis;
  createdAt: string;
};
