import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ConversationSummary } from "@cursive/shared";
import { ChatRoomList } from "./ChatRoomList.js";

function makeConversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "conv-1",
    isGroup: false,
    displayName: "Alice",
    lastMessage: "hey",
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
    ...overrides,
  };
}

describe("ChatRoomList", () => {
  it("shows an empty state when there are no conversations", () => {
    render(<ChatRoomList conversations={[]} activeId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
  });

  it("shows an unread badge when unreadCount is greater than 0", () => {
    render(<ChatRoomList conversations={[makeConversation({ unreadCount: 3 })]} activeId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides the unread badge when unreadCount is 0", () => {
    render(<ChatRoomList conversations={[makeConversation({ unreadCount: 0 })]} activeId={null} onSelect={vi.fn()} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("calls onSelect with the conversation id when clicked", () => {
    const onSelect = vi.fn();
    render(<ChatRoomList conversations={[makeConversation({ id: "conv-42" })]} activeId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Alice"));
    expect(onSelect).toHaveBeenCalledWith("conv-42");
  });
});
