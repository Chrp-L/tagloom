import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import type { Asset } from "../types";
import { previewDirectionForIndices } from "./Dialogs";
import { formatMediaTime } from "./VideoPreview";
import { VideoPreview } from "./VideoPreview";

const asset: Asset = {
  id: "video-1", sourceId: "source-1", path: "D:\\media\\clip.mp4", filename: "clip.mp4", extension: "mp4",
  mediaKind: "video", byteSize: 1024, modifiedAt: "2026-07-17T00:00:00Z", durationMs: 65000,
  thumbnailPath: "D:\\cache\\clip.jpg", note: "", status: "ready", tags: [],
};

const renderVideo = ({ item = asset, onPrepareVideo = vi.fn(async () => "D:\\cache\\preview.mp4") }: { item?: Asset; onPrepareVideo?: (asset: Asset) => Promise<string> } = {}) => render(createElement(VideoPreview, { asset: item, index: 0, count: 2, direction: 1, volume: 1, muted: false, onVolume: () => undefined, onMuted: () => undefined, onPrepareVideo, onOpenExternal: () => undefined }));

beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn(async () => undefined) });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
});
afterEach(cleanup);

describe("video preview time formatting", () => {
  it("formats short and long durations", () => {
    expect(formatMediaTime(0)).toBe("0:00");
    expect(formatMediaTime(65.9)).toBe("1:05");
    expect(formatMediaTime(3661)).toBe("1:01:01");
  });

  it("sanitizes invalid values", () => {
    expect(formatMediaTime(Number.NaN)).toBe("0:00");
    expect(formatMediaTime(-3)).toBe("0:00");
  });
});

describe("preview navigation direction", () => {
  it("maps forward and backward indexes to matching motion directions", () => {
    expect(previewDirectionForIndices(1, 2)).toBe(1);
    expect(previewDirectionForIndices(2, 1)).toBe(-1);
  });
});

describe("video preview playback", () => {
  it("opens on the poster without playing or preparing a proxy", () => {
    const prepare = vi.fn(async () => "D:\\cache\\preview.mp4");
    renderVideo({ onPrepareVideo: prepare });
    expect(document.querySelector("video")).not.toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("prepares a proxy from the first central play request and auto-plays when ready", async () => {
    const prepare = vi.fn(async () => "D:\\cache\\preview.mp4");
    renderVideo({ onPrepareVideo: prepare });
    fireEvent.click(document.querySelector(".videoCenterPlay")!);
    await waitFor(() => expect(prepare).toHaveBeenCalledWith(asset));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await waitFor(() => expect(document.querySelector("video")?.getAttribute("src")).toContain("preview.mp4"));
    fireEvent.canPlay(document.querySelector("video")!);
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
  });

  it("uses the same proxy preparation path from the bottom play control", async () => {
    const prepare = vi.fn(async () => "D:\\cache\\preview.mp4");
    renderVideo({ onPrepareVideo: prepare });
    fireEvent.click(screen.getAllByLabelText(/Play video|播放视频/).at(-1)!);
    await waitFor(() => expect(prepare).toHaveBeenCalledWith(asset));
    await waitFor(() => expect(document.querySelector("video")?.getAttribute("src")).toContain("preview.mp4"));
    fireEvent.canPlay(document.querySelector("video")!);
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
  });

  it("deduplicates central and bottom play requests while preparing", async () => {
    let resolvePreview!: (path: string) => void;
    const prepare = vi.fn(() => new Promise<string>((resolve) => { resolvePreview = resolve; }));
    renderVideo({ onPrepareVideo: prepare });
    fireEvent.click(document.querySelector(".videoCenterPlay")!);
    fireEvent.click(screen.getAllByLabelText(/Play video|播放视频/).at(-1)!);
    expect(prepare).toHaveBeenCalledTimes(1);
    await act(async () => resolvePreview("D:\\cache\\preview.mp4"));
    await waitFor(() => expect(document.querySelector("video")?.getAttribute("src")).toContain("preview.mp4"));
  });

  it("plays an existing proxy immediately without preparing it again", async () => {
    const prepare = vi.fn(async () => "D:\\cache\\unused.mp4");
    renderVideo({ item: { ...asset, previewPath: "D:\\cache\\preview.mp4" }, onPrepareVideo: prepare });
    fireEvent.click(document.querySelector(".videoCenterPlay")!);
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    expect(prepare).not.toHaveBeenCalled();
  });

  it("shows an error when proxy preparation fails", async () => {
    const prepare = vi.fn(async () => { throw new Error("prepare failed"); });
    renderVideo({ onPrepareVideo: prepare });
    fireEvent.click(document.querySelector(".videoCenterPlay")!);
    await waitFor(() => expect(screen.getByText(/This video cannot be played in Tagloom|无法在 Tagloom 中播放此视频/)).toBeInTheDocument());
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("shows an error when a prepared proxy cannot load", async () => {
    renderVideo({ item: { ...asset, previewPath: "D:\\cache\\preview.mp4" } });
    fireEvent.error(document.querySelector("video")!);
    await waitFor(() => expect(screen.getByText(/This video cannot be played in Tagloom|无法在 Tagloom 中播放此视频/)).toBeInTheDocument());
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
