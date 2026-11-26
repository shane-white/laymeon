"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileText, PenLine, RotateCcw, Sparkles } from "lucide-react";
import styles from "../landing.module.css";
import proto from "./prototype.module.css";

type Stop = {
  id: string;
  name: string;
  color: string;
  statement: string;
  detail: string;
  demo: React.ReactNode;
};

function Sample({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.demo}>
      <p className={styles.demoTag}>Sample</p>
      {children}
    </div>
  );
}

function DocumentsDemo() {
  const docs = [
    { icon: FileText, name: "Resume: Product Designer", meta: "PDF · Uploaded" },
    { icon: FileText, name: "Cover letter: General", meta: "DOCX · Uploaded" },
    { icon: PenLine, name: "Example Work: Checkout redesign", meta: "Written in LayMeOn" },
  ];
  return (
    <Sample>
      <ul className={styles.docList}>
        {docs.map((d) => (
          <li key={d.name}>
            <d.icon aria-hidden className={styles.docIcon} />
            <span className={styles.docName}>{d.name}</span>
            <span className={styles.docMeta}>{d.meta}</span>
          </li>
        ))}
      </ul>
    </Sample>
  );
}

function StoryDemo() {
  return (
    <Sample>
      <div className={styles.storyRole}>
        <p className={styles.storyTitle}>Senior Product Designer</p>
        <p className={styles.storyMeta}>Northwind Health · 2021 to 2024</p>
      </div>
      <ul className={styles.storyList}>
        <li>
          Redesigned patient checkout, cutting drop-off at payment
          <span className={styles.storySource}>from Example Work</span>
        </li>
        <li>
          Ran weekly research sessions with clinic staff
          <span className={styles.storySource}>from Resume</span>
        </li>
        <li>
          Led a team of three designers
          <span className={`${styles.storySource} ${styles.storyEdited}`}>edited by you</span>
        </li>
      </ul>
      <ul className={styles.chips} aria-label="Skills">
        {["User research", "Design systems", "Figma", "Accessibility"].map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </Sample>
  );
}

function MatchDemo() {
  const rows = [
    {
      req: "5+ years designing digital products",
      rating: "Strong",
      kind: "strong",
      quote: "“Product designer since 2017, most recently leading patient checkout.”",
      from: "Resume",
    },
    {
      req: "Experience building a design system",
      rating: "Partial",
      kind: "partial",
      quote: "“Documented the checkout components for two product teams.”",
      from: "Example Work",
    },
    {
      req: "Healthcare compliance (HIPAA)",
      rating: "Missing",
      kind: "missing",
      quote: null,
      from: null,
    },
  ] as const;
  return (
    <Sample>
      <p className={styles.matchJob}>Lead Product Designer · Acme Clinics</p>
      <ul className={styles.matchList}>
        {rows.map((r) => (
          <li key={r.req} className={styles.matchRow}>
            <div className={styles.matchHead}>
              <span className={styles.matchReq}>{r.req}</span>
              <span className={`${styles.rating} ${styles[`rating_${r.kind}`]}`}>
                <span className={styles.ratingShape} aria-hidden />
                {r.rating}
              </span>
            </div>
            {r.quote ? (
              <blockquote className={styles.evidence}>
                {r.quote}
                <cite>Evidence from your {r.from}</cite>
              </blockquote>
            ) : (
              <p className={styles.evidenceNone}>
                No Evidence in your Documents, so LayMeOn says so instead of writing one.
              </p>
            )}
          </li>
        ))}
      </ul>
    </Sample>
  );
}

const DECISIONS = ["Accept", "Edit", "Reject", "I don't have this"] as const;
type Decision = (typeof DECISIONS)[number];

function TailoringDemo() {
  const [decision, setDecision] = useState<Decision | null>(null);
  return (
    <Sample>
      <p className={styles.suggestFor}>For: Experience building a design system</p>
      <div className={styles.suggestPair}>
        <p className={styles.suggestBefore}>
          <span className={styles.suggestLabel}>On your Resume</span>
          Built UI components for the checkout flow.
        </p>
        <p className={styles.suggestAfter}>
          <span className={styles.suggestLabel}>Suggested</span>
          Built and documented the checkout component library used by two product teams.
        </p>
      </div>
      <p className={styles.suggestEvidence}>
        Backed by Evidence from your Example Work: “Documented the checkout components for two
        product teams.”
      </p>
      <div className={styles.decisions} role="group" aria-label="Your Decision">
        {DECISIONS.map((d) => (
          <button
            key={d}
            type="button"
            className={`${styles.decision} ${d === "Accept" ? styles.decisionPrimary : ""}`}
            aria-pressed={decision === d}
            onClick={() => setDecision(d)}
          >
            {d}
          </button>
        ))}
      </div>
      <p className={styles.decisionNote} aria-live="polite">
        {decision ? (
          <>
            <Check aria-hidden className={styles.decisionIcon} />
            {decision === "I don't have this"
              ? "Marked Not had. Nothing goes on your Resume."
              : `${decision}: your call, and you can undo it.`}
            <button type="button" className={styles.undo} onClick={() => setDecision(null)}>
              <RotateCcw aria-hidden className={styles.decisionIcon} />
              Undo
            </button>
          </>
        ) : (
          "Nothing changes until you decide."
        )}
      </p>
    </Sample>
  );
}

function PrepDemo() {
  const [flipped, setFlipped] = useState(false);
  const [mark, setMark] = useState<"Feels good" | "Practice more" | null>(null);
  return (
    <Sample>
      <p className={styles.deckName}>Deck: Working with others</p>
      <button
        type="button"
        className={styles.practiceCard}
        aria-expanded={flipped}
        onClick={() => setFlipped((f) => !f)}
      >
        {flipped ? (
          <span className={styles.practiceBack}>
            <span>
              <strong>What they&apos;re probing for:</strong> how you use evidence to change minds.
            </span>
            <span>
              <strong>Your experience that fits:</strong> the checkout redesign research with
              clinic staff.
            </span>
          </span>
        ) : (
          <span className={styles.practiceFront}>
            Tell me about a time research changed your team&apos;s mind.
          </span>
        )}
        <span className={styles.practiceFlip}>
          <Sparkles aria-hidden className={styles.decisionIcon} />
          {flipped ? "Show the question" : "Show the hint"}
        </span>
      </button>
      <div className={styles.decisions} role="group" aria-label="Mark this card">
        {(["Feels good", "Practice more"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={styles.decision}
            aria-pressed={mark === m}
            onClick={() => setMark(m)}
          >
            {m}
          </button>
        ))}
      </div>
    </Sample>
  );
}

const STOPS: Stop[] = [
  {
    id: "documents",
    name: "Documents",
    color: "var(--sage)",
    statement: "Bring what you already have.",
    detail:
      "Upload resumes and cover letters as PDF, DOCX or DOC, or write them here. Add Example Work for the projects a resume never has room for.",
    demo: <DocumentsDemo />,
  },
  {
    id: "career-story",
    name: "Career Story",
    color: "var(--paper)",
    statement: "One full account of everything you've done.",
    detail:
      "LayMeOn reads every Document and builds your Career Story: jobs, accomplishments, skills and education. Correct anything, and your changes stay through every Rebuild.",
    demo: <StoryDemo />,
  },
  {
    id: "match-report",
    name: "Match Report",
    color: "var(--rust)",
    statement: "See exactly how you fit each job.",
    detail:
      "Each Requirement is rated strong, partial or missing, with Evidence quoted word for word from your own Documents. Where there's no Evidence, it tells you.",
    demo: <MatchDemo />,
  },
  {
    id: "tailoring",
    name: "Tailoring",
    color: "var(--cyan)",
    statement: "Every edit is yours to make.",
    detail:
      "Work through Suggestions one at a time, each aimed at a Requirement and backed by Evidence. Accept, edit or reject it, or say you don't have it.",
    demo: <TailoringDemo />,
  },
  {
    id: "interview-prep",
    name: "Interview Prep",
    color: "var(--amber)",
    statement: "Walk in ready.",
    detail:
      "LayMeOn researches the company and how it interviews, then builds Practice cards with hints drawn from your own experience.",
    demo: <PrepDemo />,
  },
];

/*
 * PROTOTYPE (throwaway): a copy of ../tour.tsx without its CSS ribbon;
 * ride.tsx draws the track and capsule from the fair down to here.
 */
export function Tour() {
  const [active, setActive] = useState(STOPS[0].id);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.stop!);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="tour"
      className={styles.tour}
      aria-labelledby="tour-title"
      data-proto-tour
      style={{ "--rib": "28px" } as React.CSSProperties}
    >
      <div className={proto.ribbon} data-proto-rail aria-hidden />

      <div className={styles.tourIntro}>
        <h2 id="tour-title" className={styles.tourTitle}>
          Take the tour
        </h2>
        <p className={styles.tourLede}>
          Five pavilions, one loop. Everything LayMeOn makes starts from your own Documents.
        </p>
      </div>

      <ol className={styles.stops}>
        {STOPS.map((s, i) => (
          <li
            key={s.id}
            id={s.id}
            data-stop={s.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`${styles.stop} ${active === s.id ? styles.stopActive : ""}`}
            style={{ "--stop": s.color } as React.CSSProperties}
          >
            <span className={styles.stopMarker} aria-hidden>
              {i + 1}
            </span>
            <div className={styles.stopText}>
              <h3 className={styles.stopSign}>{s.name}</h3>
              <p className={styles.stopStatement}>{s.statement}</p>
              <p className={styles.stopDetail}>{s.detail}</p>
            </div>
            {s.demo}
          </li>
        ))}
      </ol>
    </section>
  );
}
