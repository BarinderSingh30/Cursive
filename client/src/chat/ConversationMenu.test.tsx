import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConversationMenu } from "./ConversationMenu.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConversationMenu", () => {
  it("calls onClearHistory when Clear chat history is clicked and confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onClearHistory = vi.fn();
    render(<ConversationMenu onClearHistory={onClearHistory} />);

    fireEvent.click(screen.getByRole("button", { name: /conversation options/i }));
    fireEvent.click(screen.getByText("Clear chat history"));

    expect(onClearHistory).toHaveBeenCalledTimes(1);
  });

  it("does not call onClearHistory when the confirmation is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onClearHistory = vi.fn();
    render(<ConversationMenu onClearHistory={onClearHistory} />);

    fireEvent.click(screen.getByRole("button", { name: /conversation options/i }));
    fireEvent.click(screen.getByText("Clear chat history"));

    expect(onClearHistory).not.toHaveBeenCalled();
  });
});
