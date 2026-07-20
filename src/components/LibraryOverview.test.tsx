import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import type { JobProgress, LibraryBootstrap } from "../types";
import { LibraryOverview } from "./LibraryOverview";

const data: LibraryBootstrap = {
  sources: Array.from({ length: 5 }, (_, index) => ({
    id: `source-${index}`,
    path: `C:/media/${index}`,
    name: `Source ${index}`,
    status: index === 1 ? "offline" as const : "ready" as const,
    assetCount: index + 1,
  })),
  tags: [],
  collections: [],
  totalAssets: 15,
  imageCount: 12,
  videoCount: 3,
};

afterEach(cleanup);

describe("LibraryOverview", () => {
  it("shows compact library health and opens one of the visible sources", () => {
    const onOpenSource = vi.fn();
    render(<LibraryOverview data={data} jobs={[]} onAddSource={vi.fn()} onOpenSource={onOpenSource} />);

    expect(document.querySelectorAll(".overviewSource")).toHaveLength(4);
    expect(screen.queryByText("Source 4")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Source 1/ }));
    expect(onOpenSource).toHaveBeenCalledWith("source-1");
  });

  it("renders active scan progress and limits recent activity", () => {
    const jobs: JobProgress[] = Array.from({ length: 5 }, (_, index) => ({
      id: `job-${index}`,
      kind: "scan",
      status: index === 0 ? "running" : "complete",
      total: 10,
      completed: index === 0 ? 4 : 10,
    }));
    render(<LibraryOverview data={data} jobs={jobs} onAddSource={vi.fn()} onOpenSource={vi.fn()} />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "4");
    expect(document.querySelectorAll(".overviewActivity span")).toHaveLength(3);
  });

  it("offers the real add-folder action when no source exists", () => {
    const onAddSource = vi.fn();
    render(<LibraryOverview data={{ ...data, sources: [] }} jobs={[]} onAddSource={onAddSource} onOpenSource={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add folder|添加文件夹/ }));
    expect(onAddSource).toHaveBeenCalledTimes(1);
  });
});
