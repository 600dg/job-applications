export const APPLICATION_STATUSES = ["Wishlist", "Applied", "Assessment", "Interview", "Offer", "Rejected"] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type Application = {
  id: string;
  company: string;
  role: string;
  location: string;
  status: ApplicationStatus;
  appliedDate: string;
  source: string;
  salary: string;
  jobUrl: string;
  jobDescription: string;
  notes: string;
  updatedAt: string;
};

export const SAMPLE_APPLICATIONS: Application[] = [
  {
    id: "app-001",
    company: "Vercel",
    role: "Product Engineer",
    location: "Remote",
    status: "Interview",
    appliedDate: "2026-07-02",
    source: "Company site",
    salary: "$150,000–$190,000 CAD",
    jobUrl: "https://vercel.com/careers",
    jobDescription:
      "Build product experiences across Vercel's platform, collaborate with design and engineering, and ship polished features for developers.",
    notes: "Technical interview scheduled.",
    updatedAt: "2026-07-02T12:00:00.000Z",
  },
  {
    id: "app-002",
    company: "Linear",
    role: "Frontend Engineer",
    location: "Remote",
    status: "Applied",
    appliedDate: "2026-07-08",
    source: "Referral",
    salary: "",
    jobUrl: "",
    jobDescription: "",
    notes: "Referred by Jamie.",
    updatedAt: "2026-07-08T12:00:00.000Z",
  },
  {
    id: "app-003",
    company: "Shopify",
    role: "Senior Developer",
    location: "Toronto, ON",
    status: "Interview",
    appliedDate: "2026-06-25",
    source: "LinkedIn",
    salary: "",
    jobUrl: "",
    jobDescription: "",
    notes: "Recruiter screen completed.",
    updatedAt: "2026-06-25T12:00:00.000Z",
  },
  {
    id: "app-004",
    company: "Stripe",
    role: "Software Engineer",
    location: "Remote — Canada",
    status: "Wishlist",
    appliedDate: "2026-07-12",
    source: "Company site",
    salary: "",
    jobUrl: "",
    jobDescription: "",
    notes: "Tailor resume before applying.",
    updatedAt: "2026-07-12T12:00:00.000Z",
  },
  {
    id: "app-005",
    company: "Notion",
    role: "Product Engineer",
    location: "New York, NY",
    status: "Rejected",
    appliedDate: "2026-06-12",
    source: "LinkedIn",
    salary: "",
    jobUrl: "",
    jobDescription: "",
    notes: "Keep an eye on future roles.",
    updatedAt: "2026-06-12T12:00:00.000Z",
  },
  {
    id: "app-006",
    company: "Figma",
    role: "Design Engineer",
    location: "San Francisco, CA",
    status: "Offer",
    appliedDate: "2026-05-29",
    source: "Referral",
    salary: "$175,000–$215,000 USD",
    jobUrl: "",
    jobDescription: "",
    notes: "Offer review on Friday.",
    updatedAt: "2026-05-29T12:00:00.000Z",
  },
  {
    id: "app-007",
    company: "1Password",
    role: "Staff Frontend Engineer",
    location: "Remote — Canada",
    status: "Applied",
    appliedDate: "2026-07-10",
    source: "Company site",
    salary: "",
    jobUrl: "",
    jobDescription: "",
    notes: "Application received.",
    updatedAt: "2026-07-10T12:00:00.000Z",
  },
  {
    id: "app-008",
    company: "Wealthsimple",
    role: "Full Stack Developer",
    location: "Toronto, ON",
    status: "Applied",
    appliedDate: "2026-07-05",
    source: "Indeed",
    salary: "",
    jobUrl: "",
    jobDescription: "",
    notes: "Follow up next week.",
    updatedAt: "2026-07-05T12:00:00.000Z",
  },
];
