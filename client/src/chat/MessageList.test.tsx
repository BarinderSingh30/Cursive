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

  it("does not show a delete control until the message is clicked", () => {
    render(<MessageList messages={[makeMessage()]} onDeleteMessage={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /delete message/i })).not.toBeInTheDocument();
  });

  it("shows a delete control after clicking the message, and calls onDeleteMessage when clicked", () => {
    const onDeleteMessage = vi.fn();
    render(<MessageList messages={[makeMessage({ id: "m1" })]} onDeleteMessage={onDeleteMessage} />);

    fireEvent.click(screen.getByText("hello"));
    fireEvent.click(screen.getByRole("button", { name: /delete message/i }));

    expect(onDeleteMessage).toHaveBeenCalledWith("m1");
  });

  it("hides the delete control when the same message is clicked again", () => {
    render(<MessageList messages={[makeMessage()]} onDeleteMessage={vi.fn()} />);

    fireEvent.click(screen.getByText("hello"));
    expect(screen.getByRole("button", { name: /delete message/i })).toBeInTheDocument();

    fireEvent.click(screen.getByText("hello"));
    expect(screen.queryByRole("button", { name: /delete message/i })).not.toBeInTheDocument();
  });

  it("switches the delete control to a different message when it's clicked", () => {
    render(
      <MessageList
        messages={[makeMessage({ id: "m1", content: "first" }), makeMessage({ id: "m2", content: "second" })]}
        onDeleteMessage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("first"));
    expect(screen.getByRole("button", { name: /delete message/i })).toBeInTheDocument();

    fireEvent.click(screen.getByText("second"));
    const deleteButtons = screen.getAllByRole("button", { name: /delete message/i });
    expect(deleteButtons).toHaveLength(1);
  });

  it("hides the delete control when clicking outside the message", () => {
    render(<MessageList messages={[makeMessage()]} onDeleteMessage={vi.fn()} />);

    fireEvent.click(screen.getByText("hello"));
    expect(screen.getByRole("button", { name: /delete message/i })).toBeInTheDocument();

    fireEvent.click(document.body);
    expect(screen.queryByRole("button", { name: /delete message/i })).not.toBeInTheDocument();
  });

  it("does not render a delete control when onDeleteMessage is omitted, even when clicked", () => {
    render(<MessageList messages={[makeMessage()]} />);
    fireEvent.click(screen.getByText("hello"));
    expect(screen.queryByRole("button", { name: /delete message/i })).not.toBeInTheDocument();
  });
});
