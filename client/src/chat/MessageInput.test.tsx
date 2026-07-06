import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "./MessageInput.js";

describe("MessageInput", () => {
  it("calls onTyping while the user types", async () => {
    const user = userEvent.setup();
    const onTyping = vi.fn();
    render(<MessageInput onSend={vi.fn()} onTyping={onTyping} />);

    await user.type(screen.getByPlaceholderText("Type a message…"), "hi");

    expect(onTyping).toHaveBeenCalled();
  });

  it("calls onSend with the trimmed content and clears the input on submit", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    const input = screen.getByPlaceholderText("Type a message…") as HTMLInputElement;
    await user.type(input, "  hello world  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith("hello world");
    expect(input.value).toBe("");
  });

  it("does not call onSend when the input is empty or whitespace only", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    await user.type(screen.getByPlaceholderText("Type a message…"), "   ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it("renders a disabled note instead of the input when disabled is true", () => {
    render(<MessageInput onSend={vi.fn()} disabled />);

    expect(screen.queryByPlaceholderText("Type a message…")).not.toBeInTheDocument();
    expect(screen.getByText(/no longer friends/i)).toBeInTheDocument();
  });

  it("renders the input as usual when disabled is false or omitted", () => {
    render(<MessageInput onSend={vi.fn()} />);

    expect(screen.getByPlaceholderText("Type a message…")).toBeInTheDocument();
    expect(screen.queryByText(/no longer friends/i)).not.toBeInTheDocument();
  });
});
