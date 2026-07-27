import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { HomeBoard } from "@cursive/shared";
import { BoardListingCard } from "./BoardListingCard.js";

function makeBoard(overrides: Partial<HomeBoard> = {}): HomeBoard {
  return {
    id: "b1",
    name: "My Board",
    ownerName: "Ada",
    shareToken: "tok-1",
    liveViewerCount: 0,
    totalViews: 5,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderCard(board: HomeBoard) {
  return render(<BoardListingCard board={board} />, { wrapper: MemoryRouter });
}

describe("BoardListingCard", () => {
  it("links to the board's watch page using its share token", () => {
    renderCard(makeBoard());
    expect(screen.getByRole("link")).toHaveAttribute("href", "/watch/tok-1");
  });

  it("shows the owner name and total view count", () => {
    renderCard(makeBoard({ ownerName: "Grace", totalViews: 5 }));
    expect(screen.getByText(/Grace/)).toBeInTheDocument();
    expect(screen.getByText(/5 views/)).toBeInTheDocument();
  });

  it("uses singular 'view' when totalViews is 1", () => {
    renderCard(makeBoard({ totalViews: 1 }));
    expect(screen.getByText(/1 view\b/)).toBeInTheDocument();
  });

  it("hides the live badge when liveViewerCount is 0", () => {
    renderCard(makeBoard({ liveViewerCount: 0 }));
    expect(screen.queryByText(/watching/)).not.toBeInTheDocument();
  });

  it("shows the live badge when liveViewerCount is greater than 0", () => {
    renderCard(makeBoard({ liveViewerCount: 3 }));
    expect(screen.getByText(/3 watching/)).toBeInTheDocument();
  });
});
