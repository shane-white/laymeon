import { describe, expect, it } from "vitest";
import { sameAccomplishment, sameEmployer, similarTitle } from "./similar";

describe("sameAccomplishment", () => {
  it("matches the same result reworded between résumé versions", () => {
    expect(
      sameAccomplishment(
        "Cut warehouse costs 30% by partitioning and clustering large Snowflake tables",
        "Reduced Snowflake warehouse costs by 30% through partitioning and clustering",
      ),
    ).toBe(true);
    expect(
      sameAccomplishment(
        "Launched self-serve dashboards that grew weekly active users 45%",
        "Launched self-serve dashboards, growing weekly active users by 45%",
      ),
    ).toBe(true);
    expect(
      sameAccomplishment(
        "Own the reporting product used by 1,200 enterprise customers",
        "Owned the reporting product used by 1200 enterprise customers",
      ),
    ).toBe(true);
  });

  it("matches the same bullet with a metric added", () => {
    expect(
      sameAccomplishment(
        "Shipped offline sync for the mobile app",
        "Shipped offline sync for the mobile app, cutting support tickets 25%",
      ),
    ).toBe(true);
  });

  it("keeps different results apart", () => {
    expect(
      sameAccomplishment(
        "Launched dashboards that grew weekly active users 45%",
        "Launched dashboards that grew weekly active users 20%",
      ),
    ).toBe(false);
    expect(
      sameAccomplishment(
        "Led the mobile app roadmap for field sales teams",
        "Ran usability studies with 80+ customers",
      ),
    ).toBe(false);
    expect(
      sameAccomplishment(
        "Built Airflow DAGs that load data from Kafka into Snowflake",
        "Designed dbt models for finance reporting used by analysts",
      ),
    ).toBe(false);
  });

  it("only matches very short text when it's identical", () => {
    expect(sameAccomplishment("Managed Jira", "Managed Jira")).toBe(true);
    expect(sameAccomplishment("Managed Jira", "Managed Jenkins")).toBe(false);
  });
});

describe("sameEmployer", () => {
  it("matches a name shortened on one résumé", () => {
    expect(sameEmployer("lumen", "lumen-analytics")).toBe(true);
    expect(sameEmployer("lumen-analytics", "lumen")).toBe(true);
    expect(sameEmployer("acme", "acme")).toBe(true);
  });

  it("doesn't match different names or very short ones", () => {
    expect(sameEmployer("lumen", "luminary")).toBe(false);
    expect(sameEmployer("ge", "ge-healthcare")).toBe(false);
    expect(sameEmployer("", "acme")).toBe(false);
  });
});

describe("similarTitle", () => {
  it("matches a title with a word added or run together", () => {
    expect(similarTitle("SelfAI Systems Developer & Architect", "AI Systems Developer & Architect")).toBe(true);
    expect(similarTitle("Data Engineer", "Senior Data Engineer")).toBe(true);
  });

  it("keeps different titles apart", () => {
    expect(similarTitle("Product Manager", "Project Manager")).toBe(false);
    expect(similarTitle("Software Engineer", "Engineering Manager")).toBe(false);
    expect(similarTitle("UX Researcher", "Product Manager")).toBe(false);
  });
});
