import { describe, expect, it } from "vitest";
import { formatDate } from "./format";

describe("formatDate", () => {
  it("does not throw for malformed metadata dates", () => {
    expect(formatDate("0000:00:00 00:00:00")).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("formats valid ISO dates", () => {
    expect(formatDate("2026-07-17T04:00:00Z")).not.toBe("—");
  });
});
