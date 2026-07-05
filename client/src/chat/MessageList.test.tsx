import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("calls onReachTop when scrolled near the top", () => {
    const onReachTop = vi.fn();
    const { container } = render(
      <MessageList messages={[makeMessage()]} onReachTop={onReachTop} loading={false} hasMore={true} />,
    );
    const scrollContainer = container.firstChild as HTMLDivElement;
    Object.defineProperty(scrollContainer, "scrollTop", { value: 10, configurable: true });

    fireEvent.scroll(scrollContainer);

    expect(onReachTop).toHaveBeenCalledTimes(1);
  });

  it("does not call onReachTop when already loading", () => {
    const onReachTop = vi.fn();
    const { container } = render(
      <MessageList messages={[makeMessage()]} onReachTop={onReachTop} loading={true} hasMore={true} />,
    );
    const scrollContainer = container.firstChild as HTMLDivElement;
    Object.defineProperty(scrollContainer, "scrollTop", { value: 10, configurable: true });

    fireEvent.scroll(scrollContainer);

    expect(onReachTop).not.toHaveBeenCalled();
  });

  it("does not call onReachTop when hasMore is false", () => {
    const onReachTop = vi.fn();
    const { container } = render(
      <MessageList messages={[makeMessage()]} onReachTop={onReachTop} loading={false} hasMore={false} />,
    );
    const scrollContainer = container.firstChild as HTMLDivElement;
    Object.defineProperty(scrollContainer, "scrollTop", { value: 10, configurable: true });

    fireEvent.scroll(scrollContainer);

    expect(onReachTop).not.toHaveBeenCalled();
  });

  it("preserves scroll position when older messages are prepended after onReachTop fires", () => {
    const onReachTop = vi.fn();
    const { container, rerender } = render(
      <MessageList messages={[makeMessage({ id: "m2" })]} onReachTop={onReachTop} loading={false} hasMore={true} />,
    );
    const scrollContainer = container.firstChild as HTMLDivElement;

    Object.defineProperty(scrollContainer, "scrollHeight", { value: 500, configurable: true });
    Object.defineProperty(scrollContainer, "scrollTop", { value: 10, writable: true, configurable: true });

    fireEvent.scroll(scrollContainer);
    expect(onReachTop).toHaveBeenCalledTimes(1);

    Object.defineProperty(scrollContainer, "scrollHeight", { value: 800, configurable: true });
    rerender(
      <MessageList
        messages={[makeMessage({ id: "m1" }), makeMessage({ id: "m2" })]}
        onReachTop={onReachTop}
        loading={false}
        hasMore={true}
      />,
    );

    expect(scrollContainer.scrollTop).toBe(10 + (800 - 500));
  });
});
