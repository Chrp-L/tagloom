import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import type { Asset, VideoPreviewProgress } from "../types";
import { previewDirectionForIndices } from "./Dialogs";
import { formatMediaTime, VideoPreview, type VideoPreviewProps } from "./VideoPreview";

const asset: Asset = {
  id: "video-1", sourceId: "source-1", path: "D:\\media\\clip.mp4", filename: "clip.mp4", extension: "mp4",
  mediaKind: "video", byteSize: 1024, modifiedAt: "2026-07-17T00:00:00Z", durationMs: 65000,
  thumbnailPath: "D:\\cache\\clip.jpg", note: "", status: "ready", tags: [],
};

interface RenderOptions {
  item?: Asset;
  onPrepareVideo?: VideoPreviewProps["onPrepareVideo"];
  onCancelVideo?: VideoPreviewProps["onCancelVideo"];
  onInvalidateVideo?: VideoPreviewProps["onInvalidateVideo"];
  onSetVideoActive?: VideoPreviewProps["onSetVideoActive"];
  onVideoProgress?: VideoPreviewProps["onVideoProgress"];
}

function renderVideo(options: RenderOptions = {}) {
  const props: VideoPreviewProps = {
    asset: options.item ?? asset,
    index: 0,
    count: 2,
    direction: 1,
    volume: 1,
    muted: false,
    onVolume: () => undefined,
    onMuted: () => undefined,
    onPrepareVideo: options.onPrepareVideo ?? vi.fn(async () => "D:\\cache\\preview.mp4"),
    onCancelVideo: options.onCancelVideo ?? vi.fn(async () => undefined),
    onInvalidateVideo: options.onInvalidateVideo ?? vi.fn(async () => undefined),
    onSetVideoActive: options.onSetVideoActive ?? vi.fn(async () => undefined),
    onVideoProgress: options.onVideoProgress ?? vi.fn(async () => () => undefined),
    onOpenExternal: () => undefined,
  };
  return { ...render(createElement(VideoPreview, props)), props };
}

function videoElement(): HTMLVideoElement {
  return document.querySelector("video")!;
}

function setMediaError(code: number, message = "media failed") {
  Object.defineProperty(videoElement(), "error", { configurable: true, value: { code, message } });
}

function centerPlay() {
  fireEvent.click(document.querySelector(".videoCenterPlay")!);
}

function bottomPlay() {
  fireEvent.click(screen.getAllByLabelText(/Play video|播放视频/).at(-1)!);
}

beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn(async () => undefined) });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

describe("video preview playback state machine", () => {
  it("opens on the poster without loading, playing, or preparing", () => {
    const prepare = vi.fn(async () => "D:\\cache\\preview.mp4");
    renderVideo({ onPrepareVideo: prepare });
    expect(videoElement().getAttribute("src")).toBeNull();
    expect(document.querySelector("[data-playback-state='poster']")).not.toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("uses the original file from the first central play request", async () => {
    const prepare = vi.fn(async () => "D:\\cache\\preview.mp4");
    renderVideo({ onPrepareVideo: prepare });
    centerPlay();
    await waitFor(() => expect(videoElement().getAttribute("src")).toContain("clip.mp4"));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("uses the same original playback path from the bottom play control", async () => {
    const prepare = vi.fn(async () => "D:\\cache\\preview.mp4");
    renderVideo({ onPrepareVideo: prepare });
    bottomPlay();
    await waitFor(() => expect(videoElement().getAttribute("src")).toContain("clip.mp4"));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("prefers an existing proxy without preparing it again", async () => {
    const prepare = vi.fn(async () => "D:\\cache\\unused.mp4");
    renderVideo({ item: { ...asset, previewPath: "D:\\cache\\preview.mp4" }, onPrepareVideo: prepare });
    centerPlay();
    await waitFor(() => expect(videoElement().getAttribute("src")).toContain("preview.mp4"));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("falls back to a compatible proxy only for an unsupported original", async () => {
    const prepare = vi.fn(async () => "D:\\cache\\preview.mp4");
    renderVideo({ onPrepareVideo: prepare });
    centerPlay();
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    setMediaError(4, "unsupported format");
    fireEvent.error(videoElement());
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(videoElement().getAttribute("src")).toContain("preview.mp4"));
    fireEvent.canPlay(videoElement());
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
  });

  it("also falls back when play rejects the original as unsupported", async () => {
    const unsupported = new DOMException("codec unsupported", "NotSupportedError");
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn()
        .mockRejectedValueOnce(unsupported)
        .mockResolvedValue(undefined),
    });
    const prepare = vi.fn(async () => "D:\\cache\\preview.mp4");
    renderVideo({ onPrepareVideo: prepare });
    centerPlay();
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(videoElement().getAttribute("src")).toContain("preview.mp4"));
    fireEvent.canPlay(videoElement());
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
  });

  it("does not transcode an original that fails for a network reason", async () => {
    const prepare = vi.fn(async () => "D:\\cache\\preview.mp4");
    renderVideo({ onPrepareVideo: prepare });
    centerPlay();
    setMediaError(2, "network failed");
    fireEvent.error(videoElement());
    await waitFor(() => expect(screen.getByText(/This video cannot be played in Tagloom|无法在 Tagloom 中播放此视频/)).toBeInTheDocument());
    expect(prepare).not.toHaveBeenCalled();
  });

  it("turns a blocked automatic play into an explicit ready state", async () => {
    const blocked = new DOMException("gesture required", "NotAllowedError");
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn(async () => { throw blocked; }) });
    renderVideo();
    centerPlay();
    await waitFor(() => expect(document.querySelector("[data-playback-state='ready']")).not.toBeNull());
    expect(screen.queryByText(/This video cannot be played in Tagloom|无法在 Tagloom 中播放此视频/)).toBeNull();
  });

  it("invalidates a broken existing proxy and falls back to the original", async () => {
    const invalidate = vi.fn(async () => undefined);
    const prepare = vi.fn(async () => "D:\\cache\\unused.mp4");
    renderVideo({ item: { ...asset, previewPath: "D:\\cache\\preview.mp4" }, onInvalidateVideo: invalidate, onPrepareVideo: prepare });
    centerPlay();
    await waitFor(() => expect(videoElement().getAttribute("src")).toContain("preview.mp4"));
    setMediaError(4, "broken proxy");
    fireEvent.error(videoElement());
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ id: asset.id })));
    await waitFor(() => expect(videoElement().getAttribute("src")).toContain("clip.mp4"));
    expect(prepare).not.toHaveBeenCalled();
  });

  it("does not loop when both the original and generated proxy fail", async () => {
    const prepare = vi.fn(async () => "D:\\cache\\preview.mp4");
    const invalidate = vi.fn(async () => undefined);
    renderVideo({ onPrepareVideo: prepare, onInvalidateVideo: invalidate });
    centerPlay();
    setMediaError(4, "unsupported original");
    fireEvent.error(videoElement());
    await waitFor(() => expect(videoElement().getAttribute("src")).toContain("preview.mp4"));
    setMediaError(4, "broken proxy");
    fireEvent.error(videoElement());
    await waitFor(() => expect(screen.getByText(/This video cannot be played in Tagloom|无法在 Tagloom 中播放此视频/)).toBeInTheDocument());
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("deduplicates play requests while preparing a proxy", async () => {
    let resolvePreview!: (path: string) => void;
    const prepare = vi.fn(() => new Promise<string>((resolve) => { resolvePreview = resolve; }));
    renderVideo({ onPrepareVideo: prepare });
    centerPlay();
    setMediaError(4, "unsupported original");
    fireEvent.error(videoElement());
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    bottomPlay();
    expect(prepare).toHaveBeenCalledTimes(1);
    await act(async () => resolvePreview("D:\\cache\\preview.mp4"));
    await waitFor(() => expect(videoElement().getAttribute("src")).toContain("preview.mp4"));
  });

  it("shows an error if compatible proxy preparation fails", async () => {
    const prepare = vi.fn(async () => { throw new Error("ffmpeg failed"); });
    renderVideo({ onPrepareVideo: prepare });
    centerPlay();
    setMediaError(4, "unsupported original");
    fireEvent.error(videoElement());
    await waitFor(() => expect(document.querySelector("[data-playback-state='error']")).not.toBeNull());
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("shows matching transcoding progress and can cancel preparation", async () => {
    let progressHandler: ((progress: VideoPreviewProgress) => void) | undefined;
    const onProgress = vi.fn(async (handler: (progress: VideoPreviewProgress) => void) => {
      progressHandler = handler;
      return () => undefined;
    });
    const cancel = vi.fn(async () => undefined);
    const prepare = vi.fn(() => new Promise<string>(() => undefined));
    renderVideo({ onPrepareVideo: prepare, onCancelVideo: cancel, onVideoProgress: onProgress });
    await waitFor(() => expect(progressHandler).toBeDefined());
    centerPlay();
    setMediaError(4, "unsupported original");
    fireEvent.error(videoElement());
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    act(() => progressHandler?.({ assetId: asset.id, phase: "transcoding", percent: 42 }));
    expect(await screen.findByText(/42%/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Cancel|取消/));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(asset));
    expect(document.querySelector("[data-playback-state='poster']")).not.toBeNull();
  });

  it("ignores progress for another asset", async () => {
    let progressHandler: ((progress: VideoPreviewProgress) => void) | undefined;
    renderVideo({
      onPrepareVideo: vi.fn(() => new Promise<string>(() => undefined)),
      onVideoProgress: async (handler) => { progressHandler = handler; return () => undefined; },
    });
    await waitFor(() => expect(progressHandler).toBeDefined());
    centerPlay();
    setMediaError(4);
    fireEvent.error(videoElement());
    act(() => progressHandler?.({ assetId: "other", phase: "transcoding", percent: 90 }));
    expect(screen.queryByText(/90%/)).toBeNull();
  });

  it("pins a loaded proxy through pause and releases it on unmount", async () => {
    const setActive = vi.fn(async () => undefined);
    const proxyAsset = { ...asset, previewPath: "D:\\cache\\preview.mp4" };
    const view = renderVideo({ item: proxyAsset, onSetVideoActive: setActive });
    centerPlay();
    await waitFor(() => expect(setActive).toHaveBeenCalledWith(proxyAsset, true));
    fireEvent.pause(videoElement());
    expect(setActive).not.toHaveBeenCalledWith(proxyAsset, false);
    view.unmount();
    await waitFor(() => expect(setActive.mock.calls.at(-1)).toEqual([proxyAsset, false]));
  });

  it("cancels an in-flight proxy preparation on unmount", async () => {
    const cancel = vi.fn(async () => undefined);
    const view = renderVideo({ onPrepareVideo: vi.fn(() => new Promise<string>(() => undefined)), onCancelVideo: cancel });
    centerPlay();
    setMediaError(4);
    fireEvent.error(videoElement());
    await waitFor(() => expect(document.querySelector("[data-playback-state='preparing-proxy']")).not.toBeNull());
    view.unmount();
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(asset));
  });

  it("enters an error state when a source produces no media event for 15 seconds", async () => {
    vi.useFakeTimers();
    renderVideo();
    centerPlay();
    await act(async () => vi.advanceTimersByTime(15_000));
    expect(document.querySelector("[data-playback-state='error']")).not.toBeNull();
  });
});
