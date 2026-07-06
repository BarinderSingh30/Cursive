import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FriendMenu } from "./FriendMenu.js";

describe("FriendMenu", () => {
  it("does not show the menu items by default", () => {
    render(<FriendMenu onRemove={vi.fn()} />);
    expect(screen.queryByText("Remove friend")).not.toBeInTheDocument();
  });

  it("shows Remove friend after clicking the ⋯ button", () => {
    render(<FriendMenu onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Friend options" }));
    expect(screen.getByText("Remove friend")).toBeInTheDocument();
  });

  it("calls onRemove and closes the menu when Remove friend is clicked", () => {
    const onRemove = vi.fn();
    render(<FriendMenu onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Friend options" }));
    fireEvent.click(screen.getByText("Remove friend"));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Remove friend")).not.toBeInTheDocument();
  });

  it("closes the menu on outside click without calling onRemove", () => {
    const onRemove = vi.fn();
    render(<FriendMenu onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Friend options" }));
    expect(screen.getByText("Remove friend")).toBeInTheDocument();

    fireEvent.click(document.body);

    expect(screen.queryByText("Remove friend")).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });
});
