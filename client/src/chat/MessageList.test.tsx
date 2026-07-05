import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChatMessage } from "@cursive/shared";
import { MessageList } from "./MessageList.js";

vi.mock("../auth/authClient.js", () => ({
  useSession: () => ({ data: { user: { id: "self-1" } } }),
}));

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    conversationId: "conv-1",
    senderId: "other-1",
    senderName: "Bob",
    content: "hello",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("MessageList", () => {
  it("renders message content and the other user's name", () => {
    render(<MessageList messages={[makeMessage()]} />);
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows no typing indicator when typingUsers is empty", () => {
    render(<MessageList messages={[]} typingUsers={[]} />);
    expect(screen.queryByText(/typing/)).not.toBeInTheDocument();
  });

  it("shows a single-person typing indicator", () => {
    render(<MessageList messages={[]} typingUsers={[{ userId: "u1", userName: "Alice" }]} />);
    expect(screen.getByText("Alice is typing…")).toBeInTheDocument();
  });

  it("shows a two-person typing indicator", () => {
    render(
      <MessageList
        messages={[]}
        typingUsers={[
          { userId: "u1", userName: "Alice" },
          { userId: "u2", userName: "Bob" },
        ]}
      />,
    );
    expect(screen.getByText("Alice and Bob are typing…")).toBeInTheDocument();
  });

  it("shows a capped typing indicator for 4 people", () => {
    render(
      <MessageList
        messages={[]}
        typingUsers={[
          { userId: "u1", userName: "Alice" },
          { userId: "u2", userName: "Bob" },
          { userId: "u3", userName: "Carol" },
          { userId: "u4", userName: "Dave" },
        ]}
      />,
    );
    expect(screen.getByText("Alice, Bob, and 2 others are typing…")).toBeInTheDocument();
  });
});
