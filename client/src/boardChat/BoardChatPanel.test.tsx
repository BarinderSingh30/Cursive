import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardChatPanel } from "./BoardChatPanel.js";

const sampleMessage = {
  id: "m1",
  boardId: "b1",
  authorId: "u1",
  authorName: "Alice",
  content: "hello",
  createdAt: new Date().toISOString(),
};

describe("BoardChatPanel", () => {
  it("renders each message with its author name", () => {
    render(<BoardChatPanel messages={[sampleMessage]} canPost={true} onSend={vi.fn()} onReachTop={vi.fn()} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("lets a logged-in visitor send a message", () => {
    const onSend = vi.fn();
    render(<BoardChatPanel messages={[]} canPost={true} onSend={onSend} onReachTop={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Chat message"), { target: { value: "hey" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("hey");
  });

  it("shows a log-in prompt instead of an input for an anonymous visitor", () => {
    render(<BoardChatPanel messages={[]} canPost={false} onSend={vi.fn()} onReachTop={vi.fn()} />);
    expect(screen.queryByLabelText("Chat message")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
  });
});
