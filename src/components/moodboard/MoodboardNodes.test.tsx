import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NodeProps } from "@xyflow/react";
import type { FlowMoodboardNode } from "../../features/moodboard/model";

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  NodeResizer: () => null,
  Position: { Top: "top", Right: "right", Bottom: "bottom", Left: "left" },
}));

import { TextNode } from "./MoodboardNodes";

describe("TextNode", () => {
  it("keeps committed text visible before the parent sends an updated document", () => {
    const onTextCommit = vi.fn();
    const props = {
      id: "text-1",
      type: "text",
      selected: false,
      data: {
        moodboardNode: {
          id: "text-1", type: "text", position: { x: 0, y: 0 }, size: { width: 280, height: 88 }, zIndex: 1,
          data: { text: "Before", fontSize: "medium", color: "#202422", align: "left" },
        },
        mode: "select",
        onTextCommit,
        onResizeEnd: vi.fn(),
        onPortClick: vi.fn(),
      },
    } as unknown as NodeProps<FlowMoodboardNode>;

    render(<TextNode {...props} />);
    const input = screen.getByRole("textbox", { name: "Text node" });
    fireEvent.doubleClick(input);
    fireEvent.change(input, { target: { value: "Updated immediately" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onTextCommit).toHaveBeenCalledWith("text-1", "Updated immediately");
    expect(input).toHaveValue("Updated immediately");
  });
});
