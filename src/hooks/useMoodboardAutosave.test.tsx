import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import type { MoodboardDocument } from "../types";
import { useMoodboardAutosave } from "./useMoodboardAutosave";

const document: MoodboardDocument = {
  id: "board", collectionId: "collection", name: "Board", viewport: { x: 0, y: 0, zoom: 1 }, backgroundColor: "#f1f2ef", nodes: [], edges: [], revision: 2,
};

afterEach(() => vi.restoreAllMocks());

describe("useMoodboardAutosave", () => {
  it("writes only once after the final debounced edit", async () => {
    vi.useFakeTimers();
    const save = vi.spyOn(api, "saveMoodboard").mockResolvedValue({ revision: 3, updatedAt: "now" });
    const { rerender } = renderHook(({ value }) => useMoodboardAutosave({ document: value, enabled: true, onSaved: vi.fn(), onError: vi.fn() }), { initialProps: { value: document } });
    rerender({ value: { ...document, name: "Board one" } });
    rerender({ value: { ...document, name: "Board two" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "Board two" }), 2);
  });

  it("adopts a renamed document without treating it as a local edit", async () => {
    vi.useFakeTimers();
    const save = vi.spyOn(api, "saveMoodboard").mockResolvedValue({ revision: 4, updatedAt: "now" });
    const { result, rerender } = renderHook(({ value }) => useMoodboardAutosave({ document: value, enabled: true, onSaved: vi.fn(), onError: vi.fn() }), { initialProps: { value: document } });
    const renamed = { ...document, name: "Renamed board", revision: 3 };

    act(() => result.current.acceptRemoteDocument(renamed));
    rerender({ value: renamed });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("saved");
  });
});
