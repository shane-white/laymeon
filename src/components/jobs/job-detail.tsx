"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExternalLink, FileText, Plus } from "lucide-react";
import {
  useAnalyzeJob,
  type UserJob,
  type AnalysisType,
} from "@/hooks/use-jobs";
import { useDocuments } from "@/hooks/use-documents";
import { statusColors } from "@/components/jobs/job-status-select";
import { JobDescriptionTab } from "@/components/jobs/job-description-tab";
import { AnalysisTab } from "@/components/jobs/analysis-tab";
import { NotesTab } from "@/components/jobs/notes-tab";
import { toast } from "sonner";

interface JobDetailProps {
  job: UserJob | null;
}

const TAB_OPTIONS = [
  { key: "match_analysis" as const, label: "Job Match Analysis", analyzeLabel: "Analyze", reanalyzeLabel: "Re-analyze", description: "Click 'Analyze' to get an analysis on how well you match for this job. Requires an uploaded resume." },
  { key: "resume_suggestions" as const, label: "Resume Suggestions", analyzeLabel: "Get Suggestions", reanalyzeLabel: "Regenerate", description: "Click 'Get Suggestions' to get resume improvement suggestions for this job. Requires an uploaded resume." },
  { key: "cover_letter_suggestions" as const, label: "Cover Letter Suggestions", analyzeLabel: "Get Suggestions", reanalyzeLabel: "Regenerate", description: "Click 'Get Suggestions' to get cover letter suggestions for this job. Requires an uploaded resume." },
  { key: "interview_suggestions" as const, label: "Interview Suggestions", analyzeLabel: "Get Suggestions", reanalyzeLabel: "Regenerate", description: "Click 'Get Suggestions' to get interview preparation suggestions for this job. Requires an uploaded resume." },
  { key: "notes" as const, label: "Notes" },
] as const;

type TabKey = "description" | AnalysisType | "notes";

function getStoredTabs(jobId: string): TabKey[] {
  try {
    const stored = localStorage.getItem(`job-tabs-${jobId}`);
    if (stored) {
      const parsed = JSON.parse(stored) as TabKey[];
      if (Array.isArray(parsed) && parsed.includes("description")) return parsed;
    }
  } catch {}
  return ["description"];
}

function storeJobTabs(jobId: string, tabs: TabKey[]) {
  try {
    localStorage.setItem(`job-tabs-${jobId}`, JSON.stringify(tabs));
  } catch {}
}

export function JobDetail({ job }: JobDetailProps) {
  const [openTabs, setOpenTabs] = useState<TabKey[]>(["description"]);
  const [activeTab, setActiveTab] = useState<TabKey>("description");
  const analyzeJob = useAnalyzeJob();
  const { data: documents } = useDocuments();

  const hasResume = documents?.some(
    (d) => d.document_type === "resume" && d.source === "uploaded",
  ) ?? false;

  // Sync open tabs when job changes
  useEffect(() => {
    if (job) {
      const tabs = getStoredTabs(job.id);
      setOpenTabs(tabs);
      setActiveTab("description");
    }
  }, [job?.id]);

  if (!job) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <FileText className="h-10 w-10" />
        <p className="text-sm">Select a job to view details</p>
      </div>
    );
  }

  const listing = job.job_listing;
  const displayTitle = job.custom_job_title || listing.extracted_job_title;
  const displayCompany =
    job.custom_job_company || listing.extracted_company_name;

  const availableTabs = TAB_OPTIONS.filter(
    (t) => !openTabs.includes(t.key),
  );

  function addTab(key: TabKey) {
    const next = [...openTabs, key];
    setOpenTabs(next);
    setActiveTab(key);
    storeJobTabs(job!.id, next);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-col gap-1 border-b px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">{displayTitle}</h1>
            {displayCompany && (
              <p className="text-sm text-muted-foreground">
                {displayCompany}
              </p>
            )}
          </div>
          <Badge
            variant="outline"
            className={`shrink-0 border-none ${statusColors[job.status] ?? ""}`}
          >
            {job.status}
          </Badge>
        </div>
        {listing.url && (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            View original listing
          </a>
        )}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabKey)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex items-center border-b px-2">
          <TabsList variant="line" className="h-9">
            <TabsTrigger value="description">Description</TabsTrigger>
            {openTabs
              .filter((t) => t !== "description")
              .map((tabKey) => {
                const opt = TAB_OPTIONS.find((o) => o.key === tabKey);
                return (
                  <TabsTrigger key={tabKey} value={tabKey}>
                    {opt?.label ?? tabKey}
                  </TabsTrigger>
                );
              })}
          </TabsList>
          {availableTabs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-7 w-7 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {availableTabs.map((t) => (
                  <DropdownMenuItem
                    key={t.key}
                    onClick={() => addTab(t.key)}
                  >
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <TabsContent value="description" className="flex min-h-0 flex-1 flex-col">
          <JobDescriptionTab description={listing.description} />
        </TabsContent>

        {(
          [
            "match_analysis",
            "resume_suggestions",
            "cover_letter_suggestions",
            "interview_suggestions",
          ] as const
        ).map((type) => {
          const opt = TAB_OPTIONS.find((o) => o.key === type)!;
          return (
            <TabsContent key={type} value={type} className="flex min-h-0 flex-1 flex-col">
              <AnalysisTab
                content={job[type]}
                onAnalyze={() =>
                  analyzeJob.mutate(
                    { id: job.id, type },
                    { onError: (err) => toast.error(err.message) },
                  )
                }
                isPending={
                  analyzeJob.isPending &&
                  analyzeJob.variables?.type === type
                }
                hasResume={hasResume}
                analyzeLabel={"analyzeLabel" in opt ? opt.analyzeLabel : ""}
                reanalyzeLabel={"reanalyzeLabel" in opt ? opt.reanalyzeLabel : ""}
                description={"description" in opt ? opt.description : ""}
              />
            </TabsContent>
          );
        })}

        <TabsContent value="notes" className="flex min-h-0 flex-1 flex-col">
          <NotesTab userJobId={job.id} content={job.notes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
