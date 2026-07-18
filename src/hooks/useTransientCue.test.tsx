import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTransientCue } from "./useTransientCue";

afterEach(() => vi.useRealTimers());

describe("useTransientCue", () => {
  it("owns the cue timer and removes the cue after its lifetime", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTransientCue(700));
    act(() => result.current.trigger("filter"));
    expect(result.current.cue).toMatchObject({ kind: "filter" });
    act(() => vi.advanceTimersByTime(700));
    expect(result.current.cue).toBeUndefined();
  });

  it("replaces an earlier cue without letting its timer clear the new cue", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTransientCue(700));
    act(() => result.current.trigger("filter"));
    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.trigger("layout"));
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.cue?.kind).toBe("layout");
  });

  it("carries a custom color and respects an event-specific duration", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTransientCue(700));
    act(() => result.current.trigger("tag", { color: "#abcdef", duration: 300 }));
    expect(result.current.cue).toMatchObject({ kind: "tag", color: "#abcdef" });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current.cue).toBeDefined();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.cue).toBeUndefined();
  });
});
