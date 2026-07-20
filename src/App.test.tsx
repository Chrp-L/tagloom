import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { useUiStore } from "./store";

beforeEach(() => useUiStore.getState().resetAssetContext());
afterEach(cleanup);

describe("Tagloom shell", () => {
  it("renders the local media workspace", async () => {
    render(<QueryClientProvider client={new QueryClient()}><App /></QueryClientProvider>);
    expect(await screen.findByText("Tagloom")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText(/搜索|Search/)).toBeInTheDocument();
    expect(await screen.findByText(/我的上下文|My contexts/)).toBeInTheDocument();
  });

  it("enters an explicit zero-item batch mode from the toolbar", async () => {
    render(<QueryClientProvider client={new QueryClient()}><App /></QueryClientProvider>);
    fireEvent.click((await screen.findAllByRole("button", { name: /全部素材|All items/ }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Batch select|批量选择/ }));
    expect(await screen.findAllByText(/0 selected|已选择 0 项/)).toHaveLength(2);
    expect(useUiStore.getState().selectionMode).toBe("batch");
  });
});
