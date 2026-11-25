import { describe, expect, it } from "vitest";
import { shouldOfferInterviewPrep } from "./offer";

describe("shouldOfferInterviewPrep", () => {
  it("offers when a Job without an Interview Prep moves to Interviewing", () => {
    expect(shouldOfferInterviewPrep({ from: "applied", to: "interviewing", hasInterviewPrep: false })).toBe(true);
  });

  it("doesn't offer again once the Job has an Interview Prep", () => {
    expect(shouldOfferInterviewPrep({ from: "applied", to: "interviewing", hasInterviewPrep: true })).toBe(false);
  });

  it("doesn't offer when the Job was already Interviewing", () => {
    expect(shouldOfferInterviewPrep({ from: "interviewing", to: "interviewing", hasInterviewPrep: false })).toBe(false);
  });

  it("doesn't offer for other statuses", () => {
    expect(shouldOfferInterviewPrep({ from: "interviewing", to: "closed", hasInterviewPrep: false })).toBe(false);
  });
});
