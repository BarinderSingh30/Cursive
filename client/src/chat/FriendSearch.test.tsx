import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FriendSummary } from "@cursive/shared";
import { FriendSearch } from "./FriendSearch.js";

function makeFriend(overrides: Partial<FriendSummary> = {}): FriendSummary {
  return {
    id: "f1",
    email: "alice@example.com",
    name: "Alice",
    ...overrides,
  };
}

describe("FriendSearch", () => {
  it("shows all friends when the query is empty", () => {
    render(
      <FriendSearch
        friends={[makeFriend({ id: "f1", name: "Alice" }), makeFriend({ id: "f2", name: "Bob", email: "bob@example.com" })]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("filters friends by a name substring, case-insensitively", async () => {
    const user = userEvent.setup();
    render(
      <FriendSearch
        friends={[makeFriend({ id: "f1", name: "Alice" }), makeFriend({ id: "f2", name: "Bob", email: "bob@example.com" })]}
        onSelect={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Search friends…"), "ali");

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("filters friends by an email substring", async () => {
    const user = userEvent.setup();
    render(
      <FriendSearch
        friends={[makeFriend({ id: "f1", name: "Alice", email: "alice@example.com" }), makeFriend({ id: "f2", name: "Bob", email: "bob@example.com" })]}
        onSelect={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Search friends…"), "bob@");

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("shows a 'No friends found' message when nothing matches", async () => {
    const user = userEvent.setup();
    render(<FriendSearch friends={[makeFriend({ name: "Alice" })]} onSelect={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Search friends…"), "zzz");

    expect(screen.getByText(/no friends found/i)).toBeInTheDocument();
  });

  it("falls back to showing the email when a friend has no name", () => {
    render(<FriendSearch friends={[makeFriend({ name: null, email: "noname@example.com" })]} onSelect={vi.fn()} />);
    expect(screen.getByText("noname@example.com")).toBeInTheDocument();
  });

  it("calls onSelect with the friend's email and clears the query when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <FriendSearch friends={[makeFriend({ name: "Alice", email: "alice@example.com" })]} onSelect={onSelect} />,
    );

    const input = screen.getByPlaceholderText("Search friends…") as HTMLInputElement;
    await user.type(input, "ali");
    await user.click(screen.getByText("Alice"));

    expect(onSelect).toHaveBeenCalledWith("alice@example.com");
    expect(input.value).toBe("");
  });
});
