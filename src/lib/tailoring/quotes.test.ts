import { describe, expect, it } from "vitest";
import { findQuote, findSection } from "./quotes";

const MARKDOWN = `# Jane Doe

## Experience

### Product Manager · Ledgerly
2020 – 2024

- Shipped **billing** for 3,000 customers
- Led the “payments” squad of C\\+\\+ engineers

## Skills

- SQL, Python`;

const located = (quote: string) => {
  const span = findQuote(MARKDOWN, quote);
  return span && MARKDOWN.slice(span.start, span.end);
};

describe("findQuote", () => {
  it("finds a quote word for word and gives its place in the Markdown", () => {
    expect(located("Shipped billing for 3,000 customers")).toBe("Shipped **billing** for 3,000 customers");
  });

  it("matches the way Match Report Evidence does: case, quotes, dashes, escapes and spacing", () => {
    expect(located('led the "payments" squad of C++ engineers')).toBe("Led the “payments” squad of C\\+\\+ engineers");
    expect(located("2020 - 2024")).toBe("2020 – 2024");
    expect(located("Product   Manager · Ledgerly")).toBe("Product Manager · Ledgerly");
  });

  it("ignores surrounding quote marks and punctuation", () => {
    expect(located('"SQL, Python."')).toBe("SQL, Python");
  });

  it("can span lines, without the bullet of the next line", () => {
    expect(located("for 3,000 customers Led the")).toBe("for 3,000 customers\n- Led the");
  });

  it("finds nothing for text that isn't there, an empty quote, or a quote with an ellipsis", () => {
    expect(findQuote(MARKDOWN, "Shipped invoicing")).toBeNull();
    expect(findQuote(MARKDOWN, "  ")).toBeNull();
    expect(findQuote(MARKDOWN, "Shipped ... customers")).toBeNull();
    expect(findQuote(MARKDOWN, "Shipped … customers")).toBeNull();
  });

  it("finds nothing for a quote that's in the Markdown more than once, so it can't land in the wrong place", () => {
    const twice = "## Experience\n\n- Ran weekly planning\n\n## Projects\n\n- Ran Weekly planning";
    expect(findQuote(twice, "Ran weekly planning")).toBeNull();
    expect(findQuote(twice, "Experience")).toEqual({ start: 3, end: 13 });
  });
});

describe("findSection", () => {
  it("finds a section heading by its title, as written in the Markdown", () => {
    expect(findSection(MARKDOWN, "skills")).toBe("Skills");
    expect(findSection(MARKDOWN, "## Experience")).toBe("Experience");
  });

  it("finds nothing for a section the Markdown doesn't have", () => {
    expect(findSection(MARKDOWN, "Education")).toBeNull();
    expect(findSection(MARKDOWN, "")).toBeNull();
  });
});
