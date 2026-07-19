import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset, HomeSnapshot } from "../types";
import { HomePage } from "./HomePage";

const asset = (id: string, thumbnailPath?: string): Asset => ({
  id, filename: `${id}.jpg`, path: `C:/media/${id}.jpg`, sourceId: "source", extension: "jpg", mediaKind: "image", byteSize: 10,
  modifiedAt: "2026-01-01T00:00:00Z", note: "", status: "ready", tags: [], thumbnailPath,
});

const first = asset("first", "https://example.test/first.jpg");
const fallback = asset("fallback", "https://example.test/fallback.jpg");
const recent = asset("recent", "https://example.test/recent.jpg");
const snapshot: HomeSnapshot = {
  collections: [
    { id: "custom", name: "Custom cover", assetCount: 2, coverAsset: first, hasCustomCover: true },
    { id: "automatic", name: "Automatic cover", assetCount: 1, coverAsset: fallback, hasCustomCover: false },
    ...Array.from({ length: 5 }, (_, index) => ({ id: `extra-${index}`, name: `Extra ${index}`, assetCount: 0, hasCustomCover: false })),
  ],
  recentViewed: [],
  recentImported: [recent],
  recentModified: [fallback],
};

afterEach(() => {
  cleanup();
  localStorage.removeItem("tagloom-home-section-state");
});

describe("HomePage", () => {
  it("shows up to six collection cards and uses supplied cover assets", () => {
    render(<HomePage snapshot={snapshot} loading={false} onOpenCollection={vi.fn()} onViewCollections={vi.fn()} onCreateCollection={vi.fn()} onFocus={vi.fn()} onPreview={vi.fn()} />);
    expect(document.querySelectorAll(".homeLoomWidget")).toHaveLength(1);
    expect(document.querySelector(".homeLoomWidget img")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".homeCollectionCard")).toHaveLength(6);
    expect(screen.getByText("Custom cover")).toBeInTheDocument();
    expect(document.querySelector('img[src="https://example.test/first.jpg"]')).toBeInTheDocument();
  });

  it("opens a collection and switches recent tabs without losing the section", async () => {
    const onOpenCollection = vi.fn();
    render(<HomePage snapshot={snapshot} loading={false} onOpenCollection={onOpenCollection} onViewCollections={vi.fn()} onCreateCollection={vi.fn()} onFocus={vi.fn()} onPreview={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Custom cover/ }));
    expect(onOpenCollection).toHaveBeenCalledWith("custom");
    fireEvent.click(screen.getByRole("tab", { name: /最近导入|Recently imported|recentImported/ }));
    await waitFor(() => expect(screen.getByText("recent.jpg")).toBeInTheDocument());
  });

  it("shows the viewed empty state and separates focus from preview", async () => {
    const onFocus = vi.fn();
    const onPreview = vi.fn();
    render(<HomePage snapshot={snapshot} loading={false} onOpenCollection={vi.fn()} onViewCollections={vi.fn()} onCreateCollection={vi.fn()} onFocus={onFocus} onPreview={onPreview} />);
    expect(screen.getByText(/预览过的素材|Assets you preview|noRecentViewed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /最近修改|Recently modified|recentModified/ }));
    const card = await waitFor(() => screen.getByRole("button", { name: /fallback\.jpg/ }));
    fireEvent.click(card);
    expect(onFocus).toHaveBeenCalledWith(fallback);
    fireEvent.doubleClick(card);
    expect(onPreview).toHaveBeenCalledWith(fallback, snapshot.recentModified);
  });

  it("can collapse the collection and recent sections independently", async () => {
    render(<HomePage snapshot={snapshot} loading={false} onOpenCollection={vi.fn()} onViewCollections={vi.fn()} onCreateCollection={vi.fn()} onFocus={vi.fn()} onPreview={vi.fn()} />);
    const collectionsToggle = screen.getByRole("button", { name: /myCollections|我的相册组/ });
    fireEvent.click(collectionsToggle);
    await waitFor(() => expect(document.querySelectorAll(".homeCollectionCard")).toHaveLength(0));
    expect(screen.getByText("recentAssets")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /recentAssets|最近素材/ }));
    await waitFor(() => expect(document.querySelectorAll(".homeAssetCard")).toHaveLength(0));
  });
});
