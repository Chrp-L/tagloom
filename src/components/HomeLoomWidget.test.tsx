import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { JobProgress } from "../types";
import { HomeLoomWidget, resolveHomeLoomProgress, resolveHomeLoomState } from "./HomeLoomWidget";

const job = (status: JobProgress["status"], completed = 0, total = 10): JobProgress => ({
  id: "job-1", kind: "scan", status, completed, total,
});

describe("HomeLoomWidget", () => {
  afterEach(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });

  it("maps scan states and progress without using asset images", () => {
    expect(resolveHomeLoomState()).toBe("idle");
    expect(resolveHomeLoomState(job("running"))).toBe("scanning");
    expect(resolveHomeLoomState(job("paused"))).toBe("paused");
    expect(resolveHomeLoomState(job("error"))).toBe("error");
    expect(resolveHomeLoomProgress(job("running", 5, 10))).toBe(.5);
    expect(resolveHomeLoomProgress(job("running", 4, 0))).toBe(0);

    const { container } = render(<HomeLoomWidget job={job("running", 5, 10)} />);
    const widget = container.querySelector(".homeLoomWidget");
    expect(widget).toHaveAttribute("data-state", "scanning");
    expect(widget).toHaveAttribute("data-paused", "false");
    expect(widget).toHaveStyle("--loom-cycle: 3.4s");
    expect(widget).toHaveStyle("--loom-progress: 50%");
    expect(widget?.querySelectorAll("img")).toHaveLength(0);
  });

  it("pauses motion for paused, reduced, and hidden states", () => {
    const { container, rerender } = render(<HomeLoomWidget job={job("paused")} />);
    const widget = () => container.querySelector(".homeLoomWidget");
    expect(widget()).toHaveAttribute("data-state", "paused");
    expect(widget()).toHaveAttribute("data-paused", "true");

    rerender(<HomeLoomWidget job={job("running")} reducedMotion />);
    expect(widget()).toHaveAttribute("data-reduced-motion", "true");
    expect(widget()).toHaveAttribute("data-paused", "true");

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new Event("visibilitychange"));
    rerender(<HomeLoomWidget job={job("running")} />);
    expect(widget()).toHaveAttribute("data-paused", "true");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("stops the loom for errors while keeping the error signal state", () => {
    const { container } = render(<HomeLoomWidget job={job("error")} />);
    const widget = container.querySelector(".homeLoomWidget");
    expect(widget).toHaveAttribute("data-state", "error");
    expect(widget).toHaveAttribute("data-paused", "false");
    expect(container.querySelector(".loomInputSignal")).toBeInTheDocument();
  });
});
