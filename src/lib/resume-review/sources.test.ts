import { describe, expect, it } from "vitest";
import { GUIDE_PATH, GUIDE_SECTIONS } from "./guide";
import { CHECK_SOURCES, readFurther, readFurtherFor, SOURCES } from "./sources";
import { ALL_CHECKS, CHECK_IDS, SECTIONS } from "./types";

describe("Read further links", () => {
  it("every check has a source or a section on the How we review resumes page", () => {
    for (const id of CHECK_IDS) {
      expect(() => readFurther(id), id).not.toThrow();
    }
  });

  it("the page covers every check exactly once, in the check's own section", () => {
    const covered = GUIDE_SECTIONS.flatMap((s) => s.items.flatMap((i) => i.checks.map((id) => ({ id, section: s.id }))));
    expect(covered.map((c) => c.id).sort()).toEqual([...CHECK_IDS].sort());
    for (const c of covered) expect(c.section, c.id).toBe(ALL_CHECKS[c.id]);
  });

  it("the page's sections follow the report's order", () => {
    expect(GUIDE_SECTIONS.map((s) => s.id)).toEqual([...SECTIONS]);
  });

  it("uses a check's best source", () => {
    expect(readFurther("length.pages")).toEqual({ kind: "source", source: SOURCES.resumego2018 });
  });

  it("links to the page section when a check has no source", () => {
    expect(CHECK_SOURCES["bullets.tense"]).toBeUndefined();
    expect(readFurther("bullets.tense")).toEqual({
      kind: "guide",
      href: `${GUIDE_PATH}#bullets`,
      title: "How we review resumes: Experience bullets",
    });
  });

  it("lists each link once for a slide whose findings share a source", () => {
    const links = readFurtherFor(["first_impression.headline", "first_impression.summary", "length.pages", "bullets.tense"]);
    expect(links).toEqual([
      { kind: "source", source: SOURCES.ladders2018 },
      { kind: "source", source: SOURCES.resumego2018 },
      { kind: "guide", href: `${GUIDE_PATH}#bullets`, title: "How we review resumes: Experience bullets" },
    ]);
  });

  it("only lists sources that exist, and every source is used", () => {
    const used = new Set(Object.values(CHECK_SOURCES).flat());
    for (const id of used) expect(SOURCES).toHaveProperty(id);
    expect([...used].sort()).toEqual(Object.keys(SOURCES).sort());
  });

  it("every source has an https link and says what it shows", () => {
    for (const [id, s] of Object.entries(SOURCES)) {
      expect(s.url, id).toMatch(/^https:\/\//);
      expect(s.shows.length, id).toBeGreaterThan(20);
    }
  });
});
