import { ApplicationsDashboard } from "@/components/applications-dashboard";
import { listApplications } from "@/lib/application-data";
import { listResumes } from "@/lib/resume-data";
import { getGmailConnection } from "@/lib/gmail-connection";

export default async function Home() {
  const [applications, resumes, gmailConnection] = await Promise.all([listApplications(), listResumes(), getGmailConnection()]);
  return <ApplicationsDashboard initialApplications={applications} initialResumes={resumes} initialGmailConnection={gmailConnection} />;
}
