import { describe, expect, it } from "vitest";
import { calculateProgress } from "./progress";

describe("calculateProgress", () => {
  it("handles an unknown total", () => expect(calculateProgress(0, 0)).toBe(0));
  it("calculates a normal ratio", () => expect(calculateProgress(25, 100)).toBe(0.25));
  it("clamps completion above the total", () => expect(calculateProgress(140, 100)).toBe(1));
  it("clamps negative completion", () => expect(calculateProgress(-5, 100)).toBe(0));
  it("rejects non-finite values", () => {
    expect(calculateProgress(Number.NaN, 100)).toBe(0);
    expect(calculateProgress(10, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
