"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, BookUser, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocuments } from "@/hooks/use-documents";
import { useProfile, useRebuildProfile, type RebuildStatus } from "@/hooks/use-profile";
import { formatDuration, isProfileStale, SENIORITY_LABELS, topSkills } from "@/lib/profile/format";
import type { CareerProfile } from "@/lib/profile/schema";
import { ChangeMarkers, ItemActions, ProfileEditor, ReviewBanner, useEditor } from "./editor";
import {
  Accomplishments,
  Education,
  Languages,
  SkillChip,
  Strengths,
  TimeInRoles,
  Tools,
  WorkHistory,
} from "./profile-sections";

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-6 sm:px-8 sm:py-10">{children}</div>
    </div>
  );
}

function Title() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Your Career Story</h1>
      <p className="text-sm text-muted-foreground">
        Your experience, skills and accomplishments, gathered from your documents.
      </p>
    </div>
  );
}

/** A rebuild the user started, or one the server is running after a document changed. */
function useRebuild(status: RebuildStatus | undefined) {
  const rebuild = useRebuildProfile();
  return {
    pending: rebuild.isPending || Boolean(status?.running),
    /** Set when the last automatic update failed. */
    error: rebuild.isPending ? null : (status?.error ?? null),
    run: () =>
      rebuild.mutate(undefined, {
        onSuccess: (profile) =>
          profile
            ? toast.success("Your Career Story is up to date")
            : toast.info("It's already updating. This page refreshes when it's done."),
        onError: (err) => toast.error(err.message),
      }),
  };
}

function RebuildButton({
  rebuild,
  label = "Rebuild",
  variant = "outline",
}: {
  rebuild: ReturnType<typeof useRebuild>;
  label?: string;
  variant?: "outline" | "default";
}) {
  return (
    <Button variant={variant} size="sm" onClick={rebuild.run} disabled={rebuild.pending}>
      {rebuild.pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {rebuild.pending ? "Reading your documents…" : label}
    </Button>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

/** The headline, editable. Offers to add one when the documents have none. */
function Headline({ headline }: { headline: string | null }) {
  const editor = useEditor();
  const item = { key: "summary", headline };
  if (!headline) {
    return (
      <button
        type="button"
        className="w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        onClick={() => editor.edit("summary", item)}
      >
        Add a headline that sums up what you do
      </button>
    );
  }
  return (
    <div className="group flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <p className="text-base">{headline}</p>
        <ItemActions section="summary" item={item} />
      </div>
      <ChangeMarkers section="summary" itemKey="summary" />
    </div>
  );
}

function Header({
  profile,
  rebuild,
  stale,
}: {
  profile: CareerProfile;
  rebuild: ReturnType<typeof useRebuild>;
  stale: boolean;
}) {
  const { summary } = profile;
  const total = formatDuration(summary.totalMonths);
  const featured = topSkills(profile);
  const documents = profile.sources.length;

  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Title />
        <RebuildButton rebuild={rebuild} />
      </div>

      {rebuild.pending && (
        <p className="text-sm text-muted-foreground">
          Updating with your latest documents. This can take a minute or two, and only documents
          that changed are read again. You can keep using the app.
        </p>
      )}

      {rebuild.error && !rebuild.pending && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Couldn&apos;t update your Career Story</AlertTitle>
          <AlertDescription>
            <p>
              It&apos;s showing what was there before your last document change. Rebuild to try
              again.
            </p>
            <p className="text-xs">{rebuild.error}</p>
          </AlertDescription>
        </Alert>
      )}

      {stale && !rebuild.pending && !rebuild.error && (
        <Alert>
          <AlertCircle />
          <AlertTitle>Your documents have changed</AlertTitle>
          <AlertDescription>
            Rebuild to include the changes in your Career Story.
          </AlertDescription>
        </Alert>
      )}

      <ReviewBanner />

      <Headline headline={summary.headline} />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {total && <Stat label="Experience" value={total} />}
        {summary.seniority && <Stat label="Level" value={SENIORITY_LABELS[summary.seniority]} />}
        {summary.currentTitle && <Stat label="Now" value={summary.currentTitle} />}
        {summary.targetRoles.length > 0 && (
          <Stat label="Looking for" value={summary.targetRoles.join(", ")} />
        )}
      </dl>

      {featured.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Your strongest skills</h2>
          <div className="flex flex-wrap gap-2">
            {featured.map((skill) => (
              <SkillChip key={skill.key} skill={skill} profile={profile} />
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Built from {documents} {documents === 1 ? "document" : "documents"} ·{" "}
        updated {formatDistanceToNow(new Date(profile.builtAt), { addSuffix: true })}. Select anything
        to see where it came from or to change it. Your changes are kept when it&apos;s rebuilt.
      </p>
    </header>
  );
}

function LoadingState() {
  return (
    <Page>
      <Title />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </Page>
  );
}

function EmptyState({
  hasDocuments,
  rebuild,
}: {
  hasDocuments: boolean;
  rebuild: ReturnType<typeof useRebuild>;
}) {
  return (
    <Page>
      <Title />
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-12 text-center">
        <BookUser className="h-8 w-8 text-muted-foreground" aria-hidden />
        {hasDocuments ? (
          <>
            <div className="flex max-w-md flex-col gap-1">
              <h2 className="text-base font-semibold">Build your Career Story</h2>
              <p className="text-sm text-muted-foreground">
                We&apos;ll read your résumés, cover letters and projects and bring together where
                you&apos;ve worked, what you&apos;re good at and what you&apos;re proud of, so job
                matches and new documents can draw on all of it.
              </p>
            </div>
            <RebuildButton rebuild={rebuild} label="Build my Career Story" variant="default" />
            {rebuild.pending && (
              <p className="text-xs text-muted-foreground">This can take a minute or two.</p>
            )}
          </>
        ) : (
          <>
            <div className="flex max-w-md flex-col gap-1">
              <h2 className="text-base font-semibold">Start with a document</h2>
              <p className="text-sm text-muted-foreground">
                Your Career Story is built from your résumés, cover letters and projects. Add one to
                get started.
              </p>
            </div>
            <Button asChild>
              <Link href="/documents">Go to Documents</Link>
            </Button>
          </>
        )}
      </div>
    </Page>
  );
}

export function CareerStory() {
  const profileQuery = useProfile();
  const documentsQuery = useDocuments();
  const rebuild = useRebuild(profileQuery.data?.rebuild);

  if (profileQuery.isPending || documentsQuery.isPending) return <LoadingState />;

  if (profileQuery.isError) {
    return (
      <Page>
        <Title />
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Couldn&apos;t load your Career Story</AlertTitle>
          <AlertDescription>
            <p>{profileQuery.error.message}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => profileQuery.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </Page>
    );
  }

  // The documents the Career Story is built from (see rebuildProfile). Generated
  // ones aren't the user's own account of their experience.
  const sourceDocuments = (documentsQuery.data ?? []).filter(
    (d) => d.source !== "generated" && d.parsed_markdown?.trim(),
  );
  const profile = profileQuery.data.profile;

  if (!profile) {
    return <EmptyState hasDocuments={sourceDocuments.length > 0} rebuild={rebuild} />;
  }

  const stale = documentsQuery.isSuccess && isProfileStale(profile, sourceDocuments);

  return (
    <ProfileEditor profile={profile}>
      <Page>
        <Header profile={profile} rebuild={rebuild} stale={stale} />
        <WorkHistory profile={profile} />
        <TimeInRoles profile={profile} />
        <Strengths profile={profile} />
        <Tools profile={profile} />
        <Accomplishments profile={profile} />
        <Education profile={profile} />
        <Languages profile={profile} />
      </Page>
    </ProfileEditor>
  );
}
