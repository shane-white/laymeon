import { describe, expect, it } from "vitest";
import { MIN_SORT_ORDER_GAP, neighborsAfterMove, positionBetween } from "@/lib/jobs/sort-order";

describe("positionBetween", () => {
  it("uses the midpoint between two neighbors", () => {
    expect(positionBetween(1, 2)).toBe(1.5);
  });

  it("goes one past the only neighbor at the top or bottom", () => {
    expect(positionBetween(null, 3)).toBe(2);
    expect(positionBetween(3, null)).toBe(4);
    expect(positionBetween(null, null)).toBe(0);
  });

  it("asks for respacing when the gap is too small", () => {
    expect(positionBetween(1, 1 + MIN_SORT_ORDER_GAP / 2)).toBeNull();
    expect(positionBetween(1, 1)).toBeNull();
  });
});

describe("neighborsAfterMove", () => {
  const list = ["a", "b", "c", "d"];

  it("moves down", () => {
    expect(neighborsAfterMove(list, 0, 2)).toEqual({ above: "c", below: "d" });
  });

  it("moves up", () => {
    expect(neighborsAfterMove(list, 3, 1)).toEqual({ above: "a", below: "b" });
  });

  it("moves to the top and bottom", () => {
    expect(neighborsAfterMove(list, 2, 0)).toEqual({ above: null, below: "a" });
    expect(neighborsAfterMove(list, 0, 3)).toEqual({ above: "d", below: null });
  });

  it("handles a hidden job between visible neighbors", () => {
    // Full order: a(1) hidden(2) b(4) c(5). Visible: a, b, c. Moving c between a and b
    // gives it 2.5: after the hidden job, before b. The hidden job doesn't move.
    const visible = [
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 4 },
      { id: "c", sort_order: 5 },
    ];
    const { above, below } = neighborsAfterMove(visible, 2, 1);
    expect(positionBetween(above!.sort_order, below!.sort_order)).toBe(2.5);
  });
});
