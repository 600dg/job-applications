import { ApplicationsDashboard } from "@/components/applications-dashboard";
import { listApplications } from "@/lib/application-data";
import { listResumes } from "@/lib/resume-data";
import { getGmailConnection } from "@/lib/gmail-connection";
import { listPendingGmailImportReviews } from "@/lib/gmail-import-review";
import { requireUserId } from "@/lib/auth";

export default async function Home() {
  const ownerId = await requireUserId();
  const [applications, resumes, gmailConnection, gmailImportReviews] = await Promise.all([
    listApplications(),
    listResumes(),
    getGmailConnection(),
    listPendingGmailImportReviews(ownerId),
  ]);
  return (
    <ApplicationsDashboard
      initialApplications={applications}
      initialResumes={resumes}
      initialGmailConnection={gmailConnection}
      initialGmailImportReviews={gmailImportReviews}
    />
  );
}
