# Laymeon — AI-Powered Job Tracker

Laymeon is a job tracking and document management application that helps job seekers organize their applications and get AI-powered insights. Users can import job listings from URLs or pasted text, upload resumes and cover letters, and receive personalized analysis on job fit, resume improvements, cover letter guidance, and interview preparation.

## Features

### Job Tracking

- Import jobs from URLs (auto-scraped via Firecrawl) or paste raw job descriptions
- Claude AI extracts job title, company name, and full description
- Track application status: Interested → Applied → Interviewing → Closed
- Override extracted titles and company names with custom values
- Soft delete with data preservation

### Job Detail Tabs

- **Description** — Full job posting text
- **Job Match Analysis** — AI-evaluated resume-to-job fit with skill gaps and match percentage
- **Resume Suggestions** — Actionable improvements tailored to the specific role
- **Cover Letter Suggestions** — Key talking points and framing strategies
- **Interview Suggestions** — Likely questions, topics to review, questions to ask
- **Notes** — Rich text editor (Tiptap) for personal annotations
- Tab state persisted per job via localStorage

### Document Management

- Upload resumes and cover letters (PDF, DOCX, DOC)
- Documents parsed to markdown via Claude for AI processing
- PDFs sent directly to Claude as base64 document blocks; DOCX extracted via Mammoth
- One active document per type per user (re-upload replaces previous)
- Files stored in Supabase Storage with RLS policies

### Authentication & PWA

- Supabase Auth with email/password
- Protected routes with automatic redirect
- Installable as a Progressive Web App with offline caching

## Tech Stack

- **Framework**: Next.js 16, React 19, TypeScript
- **Database & Auth**: Supabase (Postgres, Auth, Storage)
- **AI**: Claude claude-opus-4-5-20251101 via Anthropic SDK
- **Web Scraping**: Firecrawl
- **UI**: Tailwind CSS v4, Shadcn/ui, Radix primitives, Lucide icons
- **State**: TanStack React Query (server), Zustand (client)
- **Editor**: Tiptap with StarterKit
- **Markdown**: react-markdown + remark-gfm + @tailwindcss/typography
- **PWA**: @ducanh2912/next-pwa

## Architecture

```
src/
├── app/
│   ├── (app)/jobs/            # 3-panel resizable job tracker
│   ├── (app)/documents/       # 3-panel document manager
│   ├── api/jobs/              # CRUD + AI analysis endpoints
│   ├── api/documents/         # Upload, list, delete endpoints
│   ├── login/, signup/        # Auth pages
│   └── globals.css            # Tailwind v4 + typography plugin
├── components/
│   ├── jobs/                  # JobDetail, AnalysisTab, NotesTab, etc.
│   ├── documents/             # DocumentViewer, UploadDialog, etc.
│   ├── layout/                # IconSidebar navigation
│   └── ui/                    # Shadcn components
├── hooks/                     # React Query hooks (useJobs, useDocuments)
├── lib/
│   ├── ai/                    # Claude prompts (job extraction, doc parsing)
│   ├── parsers/               # DOCX text extraction via Mammoth
│   ├── anthropic/             # Claude SDK client
│   ├── firecrawl/             # Web scraping client
│   └── supabase/              # Server + client Supabase instances
└── proxy.ts                   # Auth middleware
```

## Database Tables

- `job_listings` — Shared job posting data (URL, extracted title/company/description)
- `user_job_listings` — Per-user job state (status, custom fields, AI analyses, notes)
- `documents` — User documents with parsed markdown, storage references, soft deletes

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase project
- Anthropic API key
- Firecrawl API key

### Database Setup

After creating your Supabase project, create the tables using the schema in supabase/dump. You can do this in the Supabase SQL editor.

### Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_PROJECT_ID=
ANTHROPIC_API_KEY=
FIRECRAWL_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Key Design Decisions

- **Soft deletes** everywhere for data recovery
- **Markdown as universal format** for consistent AI processing
- **Claude native PDF reading** instead of pdf-parse (avoids worker/bundling issues with Turbopack)
- **Optimistic updates** on status changes with rollback on error
- **Resizable 3-panel layout** on both main pages
- **ScrollArea height pattern**: `h-full` outer + `h-0 flex-1` on scroll container

## Future Feature Development

### AI Agent chat support and status monitoring

- Chat with an AI agent who can research companies, edit your notes, and respond to specific questions
- Agent will monitor your email and update job status automatically

### AI Document generation

- Use AI to generate tailored resumes and cover letters for jobs
