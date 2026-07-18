import { describe, expect, it } from "vitest";
import { isInteractiveWindowTarget } from "./windowControls";

describe("custom window drag regions", () => {
  it("keeps controls interactive inside draggable headers", () => {
    const button = document.createElement("button");
    const icon = document.createElement("span");
    button.append(icon);
    expect(isInteractiveWindowTarget(icon)).toBe(true);
  });

  it("allows empty header surfaces to toggle maximize", () => {
    const header = document.createElement("div");
    expect(isInteractiveWindowTarget(header)).toBe(false);
  });
});
