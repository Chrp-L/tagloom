import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WeaveCue } from "../features/motion/weaveCue";
import { SignalLoom, signalMotionForCue, signalPresentationForCue } from "./SignalLoom";

afterEach(cleanup);

describe("signal loom presentation", () => {
  it("keeps the three-thread track visible without an event", () => {
    render(<SignalLoom />);
    expect(document.querySelector(".signalLoom")).not.toBeNull();
    expect(document.querySelectorAll(".signalThread")).toHaveLength(3);
    expect(document.querySelector(".signalEvent")).toBeNull();
  });

  it("maps supported events to their direction, channel and color", () => {
    expect(signalPresentationForCue({ id: 1, kind: "filter" })).toMatchObject({ direction: "forward", channel: 0, color: "var(--accent)" });
    expect(signalPresentationForCue({ id: 2, kind: "layout" })).toMatchObject({ direction: "reverse", channel: 2, color: "var(--green)" });
    expect(signalPresentationForCue({ id: 3, kind: "tag", color: "#123456" })).toMatchObject({ direction: "forward", channel: 1, color: "#123456" });
    expect(signalPresentationForCue({ id: 4, kind: "scan-complete" })).toMatchObject({ direction: "forward", channel: 1, color: "var(--signal-gold)" });
    expect(signalPresentationForCue({ id: 5, kind: "sidebar" })).toBeUndefined();
  });

  it("removes positional keyframes when reduced motion is requested", () => {
    const presentation = signalPresentationForCue({ id: 1, kind: "layout" })!;
    expect(signalMotionForCue(presentation, false)).toMatchObject({ mode: "travel" });
    expect(signalMotionForCue(presentation, false).left).toHaveLength(5);
    expect(signalMotionForCue(presentation, true)).toEqual({ mode: "pulse", left: undefined, top: undefined });
  });

  it("renders event metadata and a custom tag color", () => {
    const cue: WeaveCue = { id: 9, kind: "tag", color: "#abcdef" };
    render(<SignalLoom cue={cue} />);
    const event = document.querySelector<HTMLElement>(".signalEvent");
    expect(event).toHaveAttribute("data-kind", "tag");
    expect(event).toHaveAttribute("data-direction", "forward");
    expect(event?.style.getPropertyValue("--signal-color")).toBe("#abcdef");
  });
});
