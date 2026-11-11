import { createClient } from "@/lib/supabase/server";
import { anthropic } from "@ai-sdk/anthropic";
import { CLAUDE_MODEL } from "@/lib/anthropic/client";
import {
  streamText,
  tool,
  convertToModelMessages,
  stepCountIs,
  createIdGenerator,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { formatMatchReportForPrompt } from "@/lib/match-report/format";
import type { MatchReport } from "@/lib/match-report/schema";
import {
  describeDocument,
  resolveJobDocuments,
} from "@/lib/documents/resolve-job-documents";

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const {
    messages,
    userJobId,
    conversationId,
  }: { messages: UIMessage[]; userJobId: string; conversationId: string } =
    await req.json();

  if (!userJobId) {
    return new Response("Missing userJobId", { status: 400 });
  }
  if (!z.uuid().safeParse(conversationId).success) {
    return new Response("Invalid conversationId", { status: 400 });
  }

  // Load job context
  const { data: userJob } = await supabase
    .from("user_job_listings")
    .select(
      `
      id, status, custom_job_title, custom_job_company,
      match_analysis, match_report, resume_suggestions, cover_letter_suggestions,
      interview_suggestions, notes, resume_document_id, cover_letter_document_id,
      job_listing:job_listings (
        id, url, extracted_job_title, extracted_company_name, description
      )
    `,
    )
    .eq("id", userJobId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (!userJob) {
    return new Response("Job not found", { status: 404 });
  }

  // The job's selected resume and cover letter, or the defaults.
  const { resume, coverLetter } = await resolveJobDocuments(
    supabase,
    user.id,
    userJob,
  );

  const listing = userJob.job_listing as unknown as {
    id: string;
    url: string | null;
    extracted_job_title: string;
    extracted_company_name: string | null;
    description: string | null;
  };

  const title = userJob.custom_job_title || listing.extracted_job_title;
  const company =
    userJob.custom_job_company || listing.extracted_company_name || "Unknown";

  let systemPrompt = `You are a helpful job search assistant for the Laymeon app. You are helping the user with a specific job application.`;

  if (resume?.parsed_markdown) {
    systemPrompt += `\n\n## User's Resume: ${describeDocument(resume)}\n${resume.parsed_markdown}`;
  }
  if (coverLetter?.parsed_markdown) {
    systemPrompt += `\n\n## User's Cover Letter: ${describeDocument(coverLetter)}\n${coverLetter.parsed_markdown}`;
  }

  systemPrompt += `\n\n## Current Job
- **Title**: ${title}
- **Company**: ${company}
- **Status**: ${userJob.status}
- **URL**: ${listing.url || "Not available"}

## Job Description
${listing.description || "No description available."}`;

  if (userJob.match_report) {
    systemPrompt += `\n\n## Existing Match Report\n${formatMatchReportForPrompt(userJob.match_report as MatchReport)}`;
  } else if (userJob.match_analysis) {
    systemPrompt += `\n\n## Existing Match Analysis\n${userJob.match_analysis}`;
  }
  if (userJob.resume_suggestions) {
    systemPrompt += `\n\n## Existing Resume Suggestions\n${userJob.resume_suggestions}`;
  }
  if (userJob.cover_letter_suggestions) {
    systemPrompt += `\n\n## Existing Cover Letter Suggestions\n${userJob.cover_letter_suggestions}`;
  }
  if (userJob.interview_suggestions) {
    systemPrompt += `\n\n## Existing Interview Suggestions\n${userJob.interview_suggestions}`;
  }
  if (userJob.notes) {
    systemPrompt += `\n\n## User Notes\n${userJob.notes}`;
  }

  systemPrompt += `\n\n## Instructions
- Answer questions about the job, company, and application process.
- Use the search_web tool when the user asks about company information, salary data, interview experiences, or other external information.
- Use update_job_status when the user asks to change their application status.
- Use update_analysis when the user asks to edit or regenerate analysis sections.
- Format responses in markdown when appropriate.
- Be concise since you are in a side panel with limited width.`;

  const tools = {
    search_web: tool({
      description:
        "Search the web for information about a company, role, industry, or any job-related topic. Use this when the user asks about company culture, recent news, salary ranges, interview experiences, etc.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }) => {
        const { firecrawl } = await import("@/lib/firecrawl/client");
        const results = await firecrawl.search(query, { limit: 5 });
        const webResults = results.web;
        if (!webResults || webResults.length === 0) {
          return { results: "No results found." };
        }
        return {
          results: webResults.map((r) => ({
            url: "url" in r ? r.url : undefined,
            title: "title" in r ? r.title : undefined,
            snippet: "description" in r ? r.description : undefined,
          })),
        };
      },
    }),

    update_job_status: tool({
      description:
        "Update the status of the current job application. Use when the user asks to change the job status. Valid statuses: interested, applied, interviewing, closed.",
      inputSchema: z.object({
        status: z
          .enum(["interested", "applied", "interviewing", "closed"])
          .describe("The new status for the job"),
      }),
      execute: async ({ status }) => {
        const { error } = await supabase
          .from("user_job_listings")
          .update({ status })
          .eq("id", userJobId)
          .eq("user_id", user.id);
        if (error) return { success: false, error: error.message };
        return { success: true, newStatus: status };
      },
    }),

    update_analysis: tool({
      description:
        "Update or replace an analysis section for the current job. Use when the user asks to edit, regenerate, or modify resume suggestions, cover letter suggestions, or interview suggestions. The match report can't be edited here; to refresh it, tell the user to click Re-analyze on the Job Match tab.",
      inputSchema: z.object({
        type: z
          .enum([
            "resume_suggestions",
            "cover_letter_suggestions",
            "interview_suggestions",
          ])
          .describe("Which analysis section to update"),
        content: z
          .string()
          .describe("The new markdown content for the analysis"),
      }),
      execute: async ({ type, content }) => {
        const { error } = await supabase
          .from("user_job_listings")
          .update({ [type]: content })
          .eq("id", userJobId)
          .eq("user_id", user.id);
        if (error) return { success: false, error: error.message };
        return { success: true, type, updated: true };
      },
    }),
  };

  // The system prompt is rebuilt from the job on every request, and the tools can
  // change the job (status, analysis). Claude rejects replayed thinking blocks
  // once the system prompt has changed since they were produced, so earlier
  // turns are sent without their reasoning. Reasoning within this turn's tool
  // steps is still passed along.
  const history = messages.map((m) =>
    m.role === "assistant"
      ? { ...m, parts: m.parts.filter((p) => p.type !== "reasoning") }
      : m,
  );

  const result = streamText({
    model: anthropic(CLAUDE_MODEL),
    system: systemPrompt,
    messages: await convertToModelMessages(history),
    tools,
    stopWhen: stepCountIs(5),
    // The provider doesn't know this model ID and would default to 4096 tokens,
    // which now has to cover thinking as well as the reply.
    maxOutputTokens: 16000,
    providerOptions: {
      anthropic: { effort: "low" },
    },
    onFinish: ({ finishReason }) => {
      if (finishReason === "content-filter") {
        console.warn("Claude declined a chat request", { userJobId, conversationId });
      }
    },
  });

  // Finish generating (and saving) even if the client navigates away mid-stream.
  result.consumeStream();

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
    onFinish: async ({ messages: finalMessages }) => {
      const { error } = await supabase.from("job_chat_messages").upsert(
        finalMessages.map((m) => ({
          user_id: user.id,
          user_job_id: userJobId,
          conversation_id: conversationId,
          message_id: m.id,
          role: m.role,
          message: m,
        })),
        { onConflict: "conversation_id,message_id", ignoreDuplicates: true },
      );
      if (error) console.error("Failed to save chat messages", error);
    },
  });
}
