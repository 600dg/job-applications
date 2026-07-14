export const APPLICATION_STATUSES = [
  "Wishlist",
  "Applied",
  "Assessment",
  "Interview",
  "Offer",
  "Rejected",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type Application = {
  id: string;
  company: string;
  role: string;
  location: string;
  status: ApplicationStatus;
  appliedDate: string;
  source: string;
  notes: string;
};

export const SAMPLE_APPLICATIONS: Application[] = [
  { id: "app-001", company: "Vercel", role: "Product Engineer", location: "Remote", status: "Interview", appliedDate: "2026-07-02", source: "Company site", notes: "Technical interview scheduled." },
  { id: "app-002", company: "Linear", role: "Frontend Engineer", location: "Remote", status: "Applied", appliedDate: "2026-07-08", source: "Referral", notes: "Referred by Jamie." },
  { id: "app-003", company: "Shopify", role: "Senior Developer", location: "Toronto, ON", status: "Interview", appliedDate: "2026-06-25", source: "LinkedIn", notes: "Recruiter screen completed." },
  { id: "app-004", company: "Stripe", role: "Software Engineer", location: "Remote — Canada", status: "Wishlist", appliedDate: "2026-07-12", source: "Company site", notes: "Tailor resume before applying." },
  { id: "app-005", company: "Notion", role: "Product Engineer", location: "New York, NY", status: "Rejected", appliedDate: "2026-06-12", source: "LinkedIn", notes: "Keep an eye on future roles." },
  { id: "app-006", company: "Figma", role: "Design Engineer", location: "San Francisco, CA", status: "Offer", appliedDate: "2026-05-29", source: "Referral", notes: "Offer review on Friday." },
  { id: "app-007", company: "1Password", role: "Staff Frontend Engineer", location: "Remote — Canada", status: "Applied", appliedDate: "2026-07-10", source: "Company site", notes: "Application received." },
  { id: "app-008", company: "Wealthsimple", role: "Full Stack Developer", location: "Toronto, ON", status: "Applied", appliedDate: "2026-07-05", source: "Indeed", notes: "Follow up next week." },
];
