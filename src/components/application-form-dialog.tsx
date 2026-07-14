"use client";

import { useState, type FormEvent } from "react";
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from "@/lib/applications";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FormValues = Omit<Application, "id">;

const EMPTY_FORM: FormValues = {
  company: "",
  role: "",
  location: "",
  status: "Applied",
  appliedDate: new Date().toISOString().slice(0, 10),
  source: "",
  notes: "",
};

type ApplicationFormDialogProps = {
  open: boolean;
  application: Application | null;
  onOpenChange: (open: boolean) => void;
  onSave: (values: FormValues) => Promise<void>;
};

export function ApplicationFormDialog({ open, application, onOpenChange, onSave }: ApplicationFormDialogProps) {
  const [values, setValues] = useState<FormValues>(() => application ? { ...application } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await onSave(values);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this application.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{application ? "Edit application" : "Add application"}</DialogTitle>
            <DialogDescription>{application ? "Update the details for this opportunity." : "Add a role to your job search pipeline."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-6 sm:grid-cols-2">
            <Field label="Company" htmlFor="company">
              <Input id="company" value={values.company} onChange={(e) => update("company", e.target.value)} placeholder="Acme Inc." required autoFocus />
            </Field>
            <Field label="Role" htmlFor="role">
              <Input id="role" value={values.role} onChange={(e) => update("role", e.target.value)} placeholder="Product Engineer" required />
            </Field>
            <Field label="Location" htmlFor="location">
              <Input id="location" value={values.location} onChange={(e) => update("location", e.target.value)} placeholder="Remote" required />
            </Field>
            <Field label="Status" htmlFor="status">
              <Select value={values.status} onValueChange={(value) => update("status", value as ApplicationStatus)}>
                <SelectTrigger id="status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{APPLICATION_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Application date" htmlFor="applied-date">
              <Input id="applied-date" type="date" value={values.appliedDate} onChange={(e) => update("appliedDate", e.target.value)} required />
            </Field>
            <Field label="Source" htmlFor="source">
              <Input id="source" value={values.source} onChange={(e) => update("source", e.target.value)} placeholder="LinkedIn, referral…" required />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes" htmlFor="notes">
                <Textarea id="notes" value={values.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Add follow-ups, contacts, or interview details…" rows={3} />
              </Field>
            </div>
          </div>
          <DialogFooter>
            {error && <p role="alert" className="mr-auto text-sm text-destructive">{error}</p>}
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : application ? "Save changes" : "Add application"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}
