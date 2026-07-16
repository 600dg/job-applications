"use client";

import { useMemo, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import {
  ArrowDownUp,
  BriefcaseBusiness,
  CalendarDays,
  CircleDashed,
  FilterX,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import { ApplicationFormDialog } from "@/components/application-form-dialog";
import { JobFitAnalyzer } from "@/components/job-fit-analyzer";
import { JobDiscovery } from "@/components/job-discovery";
import { GmailSyncControl } from "@/components/gmail-sync-control";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from "@/lib/applications";
import {
  createApplication,
  deleteApplication,
  updateApplication,
  updateApplicationStatus,
} from "@/app/actions/applications";
import type { SavedResume } from "@/lib/resumes";
import type { GmailConnectionStatus } from "@/lib/gmail-connection";

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  Wishlist: "border-slate-400/20 bg-slate-400/10 text-slate-300",
  Applied: "border-blue-400/20 bg-blue-400/10 text-blue-300",
  Assessment: "border-violet-400/20 bg-violet-400/10 text-violet-300",
  Interview: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  Offer: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  Rejected: "border-rose-400/20 bg-rose-400/10 text-rose-300",
};

const STATUS_SEGMENT_TONES: Record<ApplicationStatus, string> = {
  Wishlist: "bg-slate-500",
  Applied: "bg-blue-400",
  Assessment: "bg-violet-400",
  Interview: "bg-amber-300",
  Offer: "bg-emerald-300",
  Rejected: "bg-rose-300",
};

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function ApplicationsDashboard({
  initialApplications,
  initialResumes,
  initialGmailConnection,
}: {
  initialApplications: Application[];
  initialResumes: SavedResume[];
  initialGmailConnection: GmailConnectionStatus;
}) {
  const [applications, setApplications] = useState(initialApplications);
  const [status, setStatus] = useState("all");
  const [company, setCompany] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [deleting, setDeleting] = useState<Application | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [statusUpdatingId, setStatusUpdatingId] = useState("");

  const filteredApplications = useMemo(
    () =>
      applications
        .filter((application) => {
          const matchesStatus = status === "all" || application.status === status;
          const query = company.trim().toLowerCase();
          const matchesCompany = !query || application.company.toLowerCase().includes(query);
          const updateDate = application.updatedAt.slice(0, 10);
          const matchesStart = !dateFrom || updateDate >= dateFrom;
          const matchesEnd = !dateTo || updateDate <= dateTo;
          return matchesStatus && matchesCompany && matchesStart && matchesEnd;
        })
        .sort(
          (left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.company.localeCompare(right.company),
        ),
    [applications, company, dateFrom, dateTo, status],
  );

  const stats = useMemo(() => {
    const submitted = applications.filter((item) => item.status !== "Wishlist");
    const interviews = applications.filter((item) => item.status === "Interview").length;
    const offers = applications.filter((item) => item.status === "Offer").length;
    const rejected = applications.filter((item) => item.status === "Rejected").length;
    const progressed = applications.filter((item) => item.status === "Interview" || item.status === "Offer").length;
    const statusCounts = Object.fromEntries(
      APPLICATION_STATUSES.map((applicationStatus) => [
        applicationStatus,
        applications.filter((item) => item.status === applicationStatus).length,
      ]),
    ) as Record<ApplicationStatus, number>;
    return {
      total: applications.length,
      interviews,
      offers,
      rejected,
      interviewRate: applications.length ? Math.round((interviews / applications.length) * 100) : 0,
      offerRate: applications.length ? Math.round((offers / applications.length) * 100) : 0,
      responseRate: submitted.length ? Math.round((progressed / submitted.length) * 100) : 0,
      statusCounts,
    };
  }, [applications]);

  const hasFilters = status !== "all" || company || dateFrom || dateTo;

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(application: Application) {
    setEditing(application);
    setFormOpen(true);
  }
  function clearFilters() {
    setStatus("all");
    setCompany("");
    setDateFrom("");
    setDateTo("");
  }

  async function saveApplication(values: Omit<Application, "id" | "updatedAt">) {
    setMutationError("");
    const optimisticUpdatedAt = `${values.appliedDate}T12:00:00.000Z`;
    if (editing) {
      const previous = editing;
      const optimistic = { ...editing, ...values, updatedAt: optimisticUpdatedAt };
      setApplications((current) => current.map((item) => (item.id === editing.id ? optimistic : item)));
      const result = await updateApplication(editing.id, values);
      if (!result.ok) {
        setApplications((current) => current.map((item) => (item.id === previous.id ? previous : item)));
        setMutationError(result.error);
        return;
      }
      setApplications((current) => current.map((item) => (item.id === editing.id ? result.application : item)));
      return;
    }

    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const optimistic: Application = { id: optimisticId, ...values, updatedAt: optimisticUpdatedAt };
    setApplications((current) => [optimistic, ...current]);
    const result = await createApplication(values);
    if (!result.ok) {
      setApplications((current) => current.filter((item) => item.id !== optimisticId));
      setMutationError(result.error);
      return;
    }
    setApplications((current) => current.map((item) => (item.id === optimisticId ? result.application : item)));
  }

  async function confirmDelete() {
    if (!deleting) return;
    const deleted = deleting;
    setMutationError("");
    setApplications((current) => current.filter((item) => item.id !== deleted.id));
    setDeleting(null);
    const result = await deleteApplication(deleted.id);
    if (!result.ok) {
      setApplications((current) => (current.some((item) => item.id === deleted.id) ? current : [...current, deleted]));
      setMutationError(result.error);
    }
  }

  async function changeStatus(application: Application, nextStatus: ApplicationStatus) {
    if (application.status === nextStatus) return;
    setMutationError("");
    setStatusUpdatingId(application.id);
    setApplications((current) =>
      current.map((item) => (item.id === application.id ? { ...item, status: nextStatus } : item)),
    );

    const result = await updateApplicationStatus(application.id, nextStatus);
    if (!result.ok) {
      setApplications((current) => current.map((item) => (item.id === application.id ? application : item)));
      setMutationError(result.error);
    } else {
      setApplications((current) => current.map((item) => (item.id === application.id ? result.application : item)));
    }
    setStatusUpdatingId("");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <header className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-4 flex items-center gap-2.5 text-sm font-medium text-primary">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <BriefcaseBusiness className="size-4" />
            </span>
            Trackline
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Job search, at a glance.</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Keep every opportunity moving in the right direction.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="lg" onClick={openNew} className="flex-1 sm:flex-none">
            <Plus className="size-4" />
            Add application
          </Button>
          <UserButton userProfileProps={{ additionalOAuthScopes: { google: [GMAIL_READONLY_SCOPE] } }} />
        </div>
      </header>

      <Tabs defaultValue="dashboard" className="gap-6">
        <TabsList aria-label="Workspace navigation" className="w-full sm:w-auto">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="fit-analysis">Fit analysis</TabsTrigger>
          <TabsTrigger value="job-discovery">Find jobs</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="space-y-6">
          <PipelineOverview
            stats={stats}
            gmailConnection={initialGmailConnection}
            onApplicationsSynced={setApplications}
          />

          <Card className="overflow-hidden border-border/80 bg-card/85 shadow-2xl shadow-black/10 backdrop-blur-sm">
            <CardHeader className="border-b">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <CardTitle>Applications</CardTitle>
                  <CardDescription className="mt-1">
                    {filteredApplications.length} of {applications.length} opportunities
                  </CardDescription>
                </div>
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <FilterX className="size-4" />
                    Clear filters
                  </Button>
                )}
              </div>
              <div className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_1fr_1fr]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Filter by company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Filter by company…"
                    className="pl-9"
                  />
                </div>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full" aria-label="Filter by status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {APPLICATION_STATUSES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                  <Label htmlFor="date-from" className="text-xs text-muted-foreground">
                    From
                  </Label>
                  <Input id="date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                  <Label htmlFor="date-to" className="text-xs text-muted-foreground">
                    To
                  </Label>
                  <Input id="date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredApplications.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="min-w-56 pl-6">Company & role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="min-w-40">Location</TableHead>
                        <TableHead>Last Update</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredApplications.map((application) => (
                        <TableRow key={application.id}>
                          <TableCell className="pl-6">
                            <div className="font-medium">{application.role}</div>
                            <div className="mt-1 text-sm text-muted-foreground">{application.company}</div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={application.status}
                              disabled={statusUpdatingId === application.id}
                              onValueChange={(value) => changeStatus(application, value as ApplicationStatus)}
                            >
                              <SelectTrigger
                                aria-label={`Change status for ${application.role} at ${application.company}`}
                                className={`h-8 w-32 border ${STATUS_STYLES[application.status]}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {APPLICATION_STATUSES.map((item) => (
                                  <SelectItem key={item} value={item}>
                                    {item}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <MapPin className="size-3.5" />
                              {application.location}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {formatDate(application.updatedAt)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{application.source}</TableCell>
                          <TableCell className="pr-5 text-right">
                            <RowActions application={application} onEdit={openEdit} onDelete={setDeleting} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid min-h-64 place-items-center p-8 text-center">
                  <div>
                    <CircleDashed className="mx-auto mb-3 size-8 text-muted-foreground" />
                    <h3 className="font-medium">No applications found</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try clearing your filters or add a new opportunity.
                    </p>
                    <Button variant="outline" className="mt-5" onClick={hasFilters ? clearFilters : openNew}>
                      {hasFilters ? "Clear filters" : "Add application"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {mutationError && (
            <p role="alert" className="text-center text-sm text-destructive">
              {mutationError}
            </p>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Private workspace · Changes are saved automatically
          </p>
        </TabsContent>
        <TabsContent value="fit-analysis">
          <JobFitAnalyzer initialResumes={initialResumes} />
        </TabsContent>
        <TabsContent value="job-discovery">
          <JobDiscovery initialResumes={initialResumes} />
        </TabsContent>
      </Tabs>
      {formOpen && (
        <ApplicationFormDialog open application={editing} onOpenChange={setFormOpen} onSave={saveApplication} />
      )}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deleting?.role} at {deleting?.company} from your local dashboard. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function PipelineOverview({
  stats,
  gmailConnection,
  onApplicationsSynced,
}: {
  stats: {
    total: number;
    interviews: number;
    offers: number;
    rejected: number;
    interviewRate: number;
    offerRate: number;
    responseRate: number;
    statusCounts: Record<ApplicationStatus, number>;
  };
  gmailConnection: GmailConnectionStatus;
  onApplicationsSynced: (applications: Application[]) => void;
}) {
  const rate = (count: number) => (stats.total ? Math.round((count / stats.total) * 100) : 0);
  const segments = APPLICATION_STATUSES.map((applicationStatus) => ({
    label: applicationStatus,
    count: stats.statusCounts[applicationStatus],
    rate: rate(stats.statusCounts[applicationStatus]),
    tone: STATUS_SEGMENT_TONES[applicationStatus],
  }));
  const metrics = [
    { label: "Total applications", value: stats.total, detail: "Across your pipeline", icon: <ArrowDownUp /> },
    {
      label: "Interviews",
      value: stats.interviews,
      detail: `${stats.interviewRate}% of applications`,
      icon: <CalendarDays />,
    },
    { label: "Offers", value: stats.offers, detail: `${stats.offerRate}% of applications`, icon: <Trophy /> },
    {
      label: "Progression rate",
      value: `${stats.responseRate}%`,
      detail: "Interview or offer after applying",
      icon: <Sparkles />,
    },
  ];

  return (
    <Card className="overflow-visible border-border/80 bg-card/70">
      <CardHeader>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <CardTitle>Pipeline overview</CardTitle>
            <CardDescription className="mt-1">
              Live application metrics and Gmail-assisted status updates.
            </CardDescription>
          </div>
          <GmailSyncControl initialConnection={gmailConnection} onApplicationsSynced={onApplicationsSynced} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section aria-label="Application statistics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex items-start justify-between rounded-xl bg-muted/25 p-4">
              <div>
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="mt-2 font-mono text-3xl font-semibold tracking-tight">{metric.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
              </div>
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
                {metric.icon}
              </span>
            </div>
          ))}
        </section>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Current outcomes</p>
            <p className="text-xs text-muted-foreground">Hover or focus a segment</p>
          </div>
          <div
            className="relative flex h-7 w-full rounded-full bg-muted"
            role="list"
            aria-label="Application outcome distribution"
          >
            {segments.map(
              (segment) =>
                segment.count > 0 && (
                  <div
                    key={segment.label}
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${segment.label}: ${segment.count}, ${segment.rate}%`}
                    className={`${segment.tone} group relative h-full border-r border-background/40 outline-none first:rounded-l-full last:rounded-r-full last:border-r-0 hover:z-20 hover:brightness-125 focus:z-20 focus:brightness-125 focus:ring-2 focus:ring-ring`}
                    style={{ width: `${(segment.count / Math.max(stats.total, 1)) * 100}%` }}
                  >
                    <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg group-hover:block group-focus:block">
                      {segment.label} · {segment.count} · {segment.rate}%
                    </span>
                  </div>
                ),
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2" aria-label="Application status legend">
            {segments.map((segment) => (
              <div key={segment.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`size-2 rounded-full ${segment.tone}`} />
                <span>{segment.label}</span>
                <span className="font-mono text-foreground">{segment.count}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RowActions({
  application,
  onEdit,
  onDelete,
}: {
  application: Application;
  onEdit: (application: Application) => void;
  onDelete: (application: Application) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${application.role} at ${application.company}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Application</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onEdit(application)}>
          <Pencil className="size-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onDelete(application)}>
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatDate(value: string) {
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    date,
  );
}
