import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JoinCallButton } from "./JoinCallButton.js";

describe("JoinCallButton", () => {
  it("shows plain 'Join call' when nobody else is in the call", () => {
    render(<JoinCallButton isJoined={false} othersInCallCount={0} onJoin={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Join call" })).toBeInTheDocument();
  });

  it("shows a live count when others are already in the call", () => {
    render(<JoinCallButton isJoined={false} othersInCallCount={2} onJoin={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Join call · 2" })).toBeInTheDocument();
  });

  it("calls onJoin when clicked before joining", () => {
    const onJoin = vi.fn();
    render(<JoinCallButton isJoined={false} othersInCallCount={0} onJoin={onJoin} onLeave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it("shows 'In call' and calls onLeave when clicked after joining", () => {
    const onLeave = vi.fn();
    render(<JoinCallButton isJoined={true} othersInCallCount={1} onJoin={vi.fn()} onLeave={onLeave} />);
    fireEvent.click(screen.getByRole("button", { name: "In call" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
