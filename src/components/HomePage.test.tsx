import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset, HomeSnapshot, JobProgress } from "../types";
import { HomePage } from "./HomePage";
import { resolveHomeWorkbenchProgress, resolveHomeWorkbenchState } from "./HomeWorkbench";

const asset = (id: string, thumbnailPath?: string): Asset => ({
  id, filename: `${id}.jpg`, path: `C:/media/${id}.jpg`, sourceId: "source", extension: "jpg", mediaKind: "image", byteSize: 10,
  modifiedAt: "2026-01-01T00:00:00Z", note: "", status: "ready", tags: [], thumbnailPath,
});

const first = asset("first", "https://example.test/first.jpg");
const fallback = asset("fallback", "https://example.test/fallback.jpg");
const imported = ["recent", "second", "third", "fourth"].map((id) => asset(id, `https://example.test/${id}.jpg`));
const snapshot: HomeSnapshot = {
  collections: [
    { id: "custom", name: "Custom cover", assetCount: 2, coverAsset: first, hasCustomCover: true },
    { id: "automatic", name: "Automatic cover", assetCount: 1, coverAsset: fallback, hasCustomCover: false },
    ...Array.from({ length: 5 }, (_, index) => ({ id: `extra-${index}`, name: `Extra ${index}`, assetCount: 0, hasCustomCover: false })),
  ],
  recentViewed: [],
  recentImported: imported,
  recentModified: [fallback],
};

const defaultProps = {
  snapshot,
  loading: false,
  hasSources: true,
  onOpenCollection: vi.fn(),
  onViewCollections: vi.fn(),
  onCreateCollection: vi.fn(),
  onAddSource: vi.fn(),
  onFocus: vi.fn(),
  onPreview: vi.fn(),
};

const job = (status: JobProgress["status"], completed = 0, total = 10): JobProgress => ({
  id: "job-1", kind: "scan", status, completed, total,
});

afterEach(() => {
  cleanup();
  localStorage.removeItem("tagloom-home-section-state");
  vi.clearAllMocks();
});

describe("HomePage", () => {
  it("uses the latest context as the workbench lead and limits both grids", () => {
    render(<HomePage {...defaultProps} />);
    expect(document.querySelector(".homeLoomWidget")).not.toBeInTheDocument();
    expect(document.querySelector(".homeWorkbench")).toBeInTheDocument();
    expect(document.querySelectorAll(".homeWorkbenchAsset")).toHaveLength(3);
    expect(document.querySelectorAll(".homeCollectionCard")).toHaveLength(6);
    expect(document.querySelector('.homeWorkbenchCover img[src="https://example.test/first.jpg"]')).toBeInTheDocument();
    expect(document.querySelector('.homeCollectionCover img[src="https://example.test/first.jpg"]')).toBeInTheDocument();
    expect(screen.queryByText("fourth.jpg")).not.toBeInTheDocument();
  });

  it("opens the latest context and separates import focus from preview", () => {
    const onOpenCollection = vi.fn();
    const onFocus = vi.fn();
    const onPreview = vi.fn();
    render(<HomePage {...defaultProps} onOpenCollection={onOpenCollection} onFocus={onFocus} onPreview={onPreview} />);

    const workbenchContext = document.querySelector<HTMLButtonElement>(".homeWorkbenchContextAction");
    expect(workbenchContext).not.toBeNull();
    fireEvent.click(workbenchContext!);
    expect(onOpenCollection).toHaveBeenCalledWith("custom");

    const importCard = screen.getByRole("button", { name: /recent\.jpg/ });
    fireEvent.click(importCard);
    expect(onFocus).toHaveBeenCalledWith(imported[0]);
    fireEvent.doubleClick(importCard);
    expect(onPreview).toHaveBeenCalledWith(imported[0], snapshot.recentImported);
  });

  it("offers real setup actions when the workbench has no context or source", () => {
    const onCreateCollection = vi.fn();
    const onAddSource = vi.fn();
    render(<HomePage {...defaultProps} snapshot={{ ...snapshot, collections: [] }} hasSources={false} onCreateCollection={onCreateCollection} onAddSource={onAddSource} />);

    fireEvent.click(document.querySelector<HTMLButtonElement>(".homeWorkbenchContext .homeWorkbenchEmpty")!);
    expect(onCreateCollection).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector<HTMLButtonElement>(".homeWorkbenchAddSource")!);
    expect(onAddSource).toHaveBeenCalledTimes(1);
  });

  it("shows static states for an empty import feed and a snapshot error", () => {
    const emptySnapshot = { ...snapshot, recentImported: [] };
    const { rerender } = render(<HomePage {...defaultProps} snapshot={emptySnapshot} />);
    expect(document.querySelector(".homeWorkbenchImportsEmpty")).toBeInTheDocument();
    expect(document.querySelectorAll(".homeWorkbenchAsset")).toHaveLength(0);

    rerender(<HomePage {...defaultProps} snapshot={undefined} error="Snapshot unavailable" />);
    expect(document.querySelector(".homeWorkbenchContext .errorState")).toHaveTextContent("Snapshot unavailable");
  });

  it("maps running, paused, error, complete, and idle scan states", () => {
    expect(resolveHomeWorkbenchState()).toBe("idle");
    expect(resolveHomeWorkbenchState(job("running"))).toBe("running");
    expect(resolveHomeWorkbenchState(job("paused"))).toBe("paused");
    expect(resolveHomeWorkbenchState(job("error"))).toBe("error");
    expect(resolveHomeWorkbenchState(job("complete"))).toBe("complete");
    expect(resolveHomeWorkbenchState(job("cancelled"))).toBe("idle");
    expect(resolveHomeWorkbenchProgress(job("running", 5, 10))).toBe(0.5);
    expect(resolveHomeWorkbenchProgress(job("running", 4, 0))).toBe(0);

    const { rerender } = render(<HomePage {...defaultProps} job={job("running", 5, 10)} />);
    const status = () => document.querySelector(".homeWorkbenchIndex");
    expect(status()).toHaveAttribute("data-state", "running");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "5");
    rerender(<HomePage {...defaultProps} job={job("paused")} />);
    expect(status()).toHaveAttribute("data-state", "paused");
    rerender(<HomePage {...defaultProps} job={{ ...job("error"), message: "Disk unavailable" }} />);
    expect(status()).toHaveAttribute("data-state", "error");
    expect(screen.getByText("Disk unavailable")).toBeInTheDocument();
    rerender(<HomePage {...defaultProps} job={job("complete", 10, 10)} />);
    expect(status()).toHaveAttribute("data-state", "complete");
  });

  it("opens a collection and switches recent tabs without losing the section", async () => {
    const onOpenCollection = vi.fn();
    render(<HomePage {...defaultProps} onOpenCollection={onOpenCollection} />);
    fireEvent.click(document.querySelectorAll<HTMLButtonElement>(".homeCollectionCard")[0]);
    expect(onOpenCollection).toHaveBeenCalledWith("custom");
    fireEvent.click(screen.getByRole("tab", { name: /最近导入|Recently imported|recentImported/ }));
    await waitFor(() => expect(document.querySelector(".homeRecentGrid")).toHaveTextContent("recent.jpg"));
  });

  it("shows the viewed empty state and preserves focus and preview in recent tabs", async () => {
    const onFocus = vi.fn();
    const onPreview = vi.fn();
    render(<HomePage {...defaultProps} onFocus={onFocus} onPreview={onPreview} />);
    expect(screen.getByText(/预览过的素材|Assets you preview|noRecentViewed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /最近修改|Recently modified|recentModified/ }));
    await waitFor(() => expect(document.querySelector(".homeRecentGrid .homeAssetCard")).not.toBeNull());
    const card = document.querySelector<HTMLButtonElement>(".homeRecentGrid .homeAssetCard")!;
    fireEvent.click(card);
    expect(onFocus).toHaveBeenCalledWith(fallback);
    fireEvent.doubleClick(card);
    expect(onPreview).toHaveBeenCalledWith(fallback, snapshot.recentModified);
  });

  it("collapses collection and recent sections independently and persists them", async () => {
    render(<HomePage {...defaultProps} />);
    const collectionsToggle = screen.getByRole("button", { name: /myCollections|我的相册组|我的上下文/ });
    fireEvent.click(collectionsToggle);
    await waitFor(() => expect(document.querySelectorAll(".homeCollectionCard")).toHaveLength(0));
    expect(document.querySelector(".homeWorkbench")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /recentAssets|最近素材/ }));
    await waitFor(() => expect(document.querySelectorAll(".homeAssetCard")).toHaveLength(0));
    await waitFor(() => expect(localStorage.getItem("tagloom-home-section-state")).toBe(JSON.stringify({ collections: false, recent: false })));
  });
});
