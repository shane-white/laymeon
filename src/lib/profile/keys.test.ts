import { describe, expect, it } from "vitest";
import { dedupeKeys, normalizeEmployer, positionKey, skillKey, skillMatchKey, slugify } from "./keys";

describe("slugify", () => {
  it("keeps symbols that change a skill's meaning", () => {
    expect(slugify("C++")).toBe("c-plus-plus");
    expect(slugify("C#")).toBe("c-sharp");
    expect(slugify("C")).toBe("c");
    expect(slugify(".NET")).toBe("dot-net");
    expect(slugify("Node.js")).toBe("node-js");
    expect(slugify("R&D")).toBe("r-and-d");
  });

  it("removes accents and case", () => {
    expect(slugify("Société Générale")).toBe("societe-generale");
  });

  it("falls back to a hash for non-Latin names", () => {
    expect(slugify("日本語")).toMatch(/^x-[0-9a-f]{10}$/);
    expect(slugify("日本語")).toBe(slugify("日本語"));
  });
});

describe("normalizeEmployer", () => {
  it("ignores company suffixes, 'The', punctuation and case", () => {
    expect(normalizeEmployer("Acme, Inc.")).toBe("acme");
    expect(normalizeEmployer("ACME")).toBe("acme");
    expect(normalizeEmployer("The Acme Company")).toBe("acme");
    expect(normalizeEmployer("Northwind Logistics LLC")).toBe("northwind-logistics");
  });

  it("only strips suffixes at the end", () => {
    expect(normalizeEmployer("Coca-Cola Co")).toBe("coca-cola");
    expect(normalizeEmployer("Incredible Labs")).toBe("incredible-labs");
  });
});

describe("keys", () => {
  it("uses only the start year in position keys", () => {
    expect(positionKey("Acme Inc", "Software Engineer", "2019-03")).toBe(
      positionKey("ACME", "software engineer", "2019"),
    );
    expect(positionKey("Acme", "Software Engineer", null)).toBe("acme|software-engineer|unknown");
  });

  it("keys skills by canonical name", () => {
    expect(skillKey("PostgreSQL")).toBe("postgresql");
  });

  it("matches skill spellings loosely", () => {
    for (const name of ["React.js", "ReactJS", "React JS", "react"]) {
      expect(skillMatchKey(name)).toBe(skillMatchKey("React"));
    }
    expect(skillMatchKey("Power BI")).toBe(skillMatchKey("PowerBI"));
    expect(skillMatchKey("JS")).toBe("js");
    expect(skillMatchKey("C++")).not.toBe(skillMatchKey("C"));
  });

  it("suffixes repeated keys in order", () => {
    expect(dedupeKeys([{ key: "a" }, { key: "b" }, { key: "a" }]).map((i) => i.key)).toEqual([
      "a",
      "b",
      "a-2",
    ]);
  });
});
