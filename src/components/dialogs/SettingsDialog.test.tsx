import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import type { VideoPreviewCacheStatus } from "../../types";
import { SettingsDialog, type SettingsDialogProps } from "./SettingsDialog";

const GIB = 1024 ** 3;
const status: VideoPreviewCacheStatus = {
  usedBytes: 1.5 * GIB,
  limitBytes: 5 * GIB,
  itemCount: 3,
  pendingCleanupBytes: 256 * 1024 ** 2,
};

function renderDialog(overrides: Partial<SettingsDialogProps> = {}) {
  const props: SettingsDialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    theme: "system",
    language: "system",
    onTheme: vi.fn(),
    onLanguage: vi.fn(),
    onBackup: vi.fn(),
    onRestore: vi.fn(),
    videoCacheStatus: status,
    onVideoCacheLimit: vi.fn(),
    onClearVideoCache: vi.fn(),
    ...overrides,
  };
  render(<SettingsDialog {...props} />);
  return props;
}

afterEach(cleanup);

describe("SettingsDialog video preview cache", () => {
  it("shows usage, item count, pending cleanup and the active limit", () => {
    renderDialog();

    expect(screen.getByText(/1\.5 GB/)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("256.0 MB");
    expect(screen.getByRole("button", { name: "5 GB" })).toHaveAttribute("aria-pressed", "true");
  });

  it("submits byte values for limits and invokes cache clearing", () => {
    const onVideoCacheLimit = vi.fn();
    const onClearVideoCache = vi.fn();
    renderDialog({ onVideoCacheLimit, onClearVideoCache });

    fireEvent.click(screen.getByRole("button", { name: "10 GB" }));
    fireEvent.click(screen.getByRole("button", { name: /立即清理|Clear now|Clear video cache/ }));

    expect(onVideoCacheLimit).toHaveBeenCalledWith(10 * GIB);
    expect(onClearVideoCache).toHaveBeenCalledTimes(1);
  });

  it("disables cache actions while loading or updating", () => {
    const { unmount } = render(<SettingsDialog
      {...renderDialogProps({ videoCacheLoading: true })}
    />);
    expect(screen.getByRole("button", { name: "2 GB" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /立即清理|Clear now|Clear video cache/ })).toBeDisabled();
    unmount();

    render(<SettingsDialog {...renderDialogProps({ videoCacheUpdating: true })} />);
    expect(screen.getByRole("button", { name: "20 GB" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /立即清理|Clear now|Clear video cache/ })).toBeDisabled();
  });

  it("keeps existing settings actions available", () => {
    const onTheme = vi.fn();
    const onBackup = vi.fn();
    renderDialog({ onTheme, onBackup });

    fireEvent.click(screen.getByRole("button", { name: /themeDark|深色|Dark/ }));
    fireEvent.click(screen.getByRole("button", { name: /createBackup|创建备份|Create database backup/ }));

    expect(onTheme).toHaveBeenCalledWith("dark");
    expect(onBackup).toHaveBeenCalledTimes(1);
  });
});

function renderDialogProps(overrides: Partial<SettingsDialogProps> = {}): SettingsDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    theme: "system",
    language: "system",
    onTheme: vi.fn(),
    onLanguage: vi.fn(),
    onBackup: vi.fn(),
    onRestore: vi.fn(),
    videoCacheStatus: status,
    onVideoCacheLimit: vi.fn(),
    onClearVideoCache: vi.fn(),
    ...overrides,
  };
}
