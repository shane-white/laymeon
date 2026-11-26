# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Any active job seeker, whatever their situation: laid off, employed and looking, or early in their career. They are running a search with several jobs in flight at once, and they come back to the app throughout it to add jobs, update a Job's status, tailor a Resume for a specific Job and prepare for interviews.

## Product Purpose

LayMeOn keeps a job seeker's applications and their own career documents in one place. From those Documents it builds a Career Story, a full account of the user's experience, and uses Claude to show how well a Resume fits each Job, suggest grounded edits (Tailoring), review a Resume on its own and prepare the user for interviews (Interview Prep). Success means the user sends applications that truthfully present their best fit for each role, and walks into interviews prepared.

## Positioning

The AI is grounded in the user's own story. Everything LayMeOn suggests comes from the user's own uploaded or written Documents and the Career Story built from them, with Evidence behind each claim. It never invents experience, and the user accepts, edits or rejects every Suggestion. Generic AI resume tools write plausible text; LayMeOn works only from what the user has actually done.

## Operating Context

- Jobs are imported from a URL (scraped with Firecrawl) or pasted text, then tracked through Interested → Applied → Interviewing → Closed.
- Each Job has a Match Report, Tailoring, cover letter and interview suggestions, Interview Prep (Practice cards, Decks, Practice sessions), Notes and a job chat.
- Documents are Resumes, Cover letters and Example Work, uploaded as PDF, DOCX or DOC, or written in the app.
- The app is installable as a PWA and used on desktop and mobile.
- Terms are defined in `GLOSSARY.md`, and UI copy uses them.

## Capabilities and Constraints

- The existing app is built from shadcn/ui components with default styles (Next.js 16, Tailwind CSS v4, Radix, Lucide, Tiptap).
- The marketing site (landing pages, purchases) is not built yet; see the Linear **Launch** project.
- The name is written "LayMeOn" for now. It may change to all caps ("LAYMEON") or separate words ("Lay Me On"), so the wordmark must stay easy to swap.
- Open: pricing and plans. No prices may be stated until they are decided.

## Brand Commitments

- Voice: upbeat and confident. Optimistic, "you've got this" energy. The pun in the name is not played up.
- Visual direction set by the owner: inspired by 1980s advertising and retro-futurism. The marketing site may be more exciting; the app interface must stay clean and useful.
- App copy, docs and glossary use American English.

## Evidence on Hand

- No logo, brand marks, screenshots, testimonials, customer names, usage numbers or press exist yet. Don't invent any of them.
- Real product material: the working app, `GLOSSARY.md`, and the Linear "Product Description" and rubric documents.

## Product Principles

1. Grounded, never invented: every AI output traces back to the user's own Documents and Evidence.
2. The user decides: AI proposes, and the user accepts, edits or rejects.
3. Momentum: a job search is long, and the product keeps the user confident and moving forward.
4. One place for the whole search: Jobs, Documents and prep stay connected.
