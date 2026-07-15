export type ResumeImprovement = {
  category: "Summary" | "Experience" | "Impact" | "Skills" | "Keywords" | "Clarity";
  original: string;
  revised: string;
  reason: string;
};

export type ResumeImprovementReport = {
  mode: "general" | "tailored";
  overview: string;
  edits: ResumeImprovement[];
  questions: string[];
};
