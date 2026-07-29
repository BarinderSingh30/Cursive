import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CallStrip, computeTileSize } from "./CallStrip.js";
import type { CallParticipant } from "./useCall.js";

function makeParticipant(overrides: Partial<CallParticipant> = {}): CallParticipant {
  return {
    identity: "user-1",
    name: "Ada",
    isLocal: true,
    canPublish: true,
    cameraTrack: null,
    audioTrack: null,
    micEnabled: true,
    cameraEnabled: true,
    ...overrides,
  };
}

const noop = vi.fn();

describe("CallStrip", () => {
  it("is repositioned by dragging its header (client-side only)", () => {
    render(
      <CallStrip
        participants={[makeParticipant()]}
        canPublish={true}
        micEnabled={true}
        cameraEnabled={true}
        onToggleMic={noop}
        onToggleCamera={noop}
        onLeave={noop}
      />,
    );

    const header = screen.getByText(/Call · 1 on/);
    const wrapper = header.closest("div")!.parentElement!.parentElement as HTMLElement;
    expect(wrapper.style.left).toBe("16px");
    expect(wrapper.style.top).toBe("64px");

    fireEvent.mouseDown(header, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 130 });
    fireEvent.mouseUp(window);

    expect(wrapper.style.left).toBe("56px");
    expect(wrapper.style.top).toBe("94px");
  });

  it("grows when the corner resize handle is dragged", () => {
    render(
      <CallStrip
        participants={[makeParticipant()]}
        canPublish={true}
        micEnabled={true}
        cameraEnabled={true}
        onToggleMic={noop}
        onToggleCamera={noop}
        onLeave={noop}
      />,
    );

    const handle = screen.getByTitle("Drag to resize");
    const tiles = handle.previousSibling as HTMLElement;
    expect(tiles.style.width).toBe("280px");
    expect(tiles.style.height).toBe("106px");

    fireEvent.mouseDown(handle, { clientX: 200, clientY: 200 });
    fireEvent.mouseMove(window, { clientX: 260, clientY: 250 });
    fireEvent.mouseUp(window);

    expect(tiles.style.width).toBe("340px");
    expect(tiles.style.height).toBe("156px");
  });

  it("grows the individual video tile when the card is resized, instead of leaving it fixed-size", () => {
    render(
      <CallStrip
        participants={[makeParticipant()]}
        canPublish={true}
        micEnabled={true}
        cameraEnabled={true}
        onToggleMic={noop}
        onToggleCamera={noop}
        onLeave={noop}
      />,
    );

    const handle = screen.getByTitle("Drag to resize");
    const tiles = handle.previousSibling as HTMLElement;
    const tile = tiles.firstElementChild as HTMLElement;
    const initialWidth = tile.style.width;
    const initialHeight = tile.style.height;

    fireEvent.mouseDown(handle, { clientX: 200, clientY: 200 });
    fireEvent.mouseMove(window, { clientX: 260, clientY: 250 });
    fireEvent.mouseUp(window);

    expect(tile.style.width).not.toBe(initialWidth);
    expect(tile.style.height).not.toBe(initialHeight);
    expect(parseInt(tile.style.width, 10)).toBeGreaterThan(parseInt(initialWidth, 10));
    expect(parseInt(tile.style.height, 10)).toBeGreaterThan(parseInt(initialHeight, 10));
  });

  it("shrinks tiles to fit as more participants join, down to a sane minimum", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      makeParticipant({ identity: `user-${i}`, name: `User ${i}`, isLocal: i === 0 }),
    );
    render(
      <CallStrip
        participants={many}
        canPublish={true}
        micEnabled={true}
        cameraEnabled={true}
        onToggleMic={noop}
        onToggleCamera={noop}
        onLeave={noop}
      />,
    );

    const handle = screen.getByTitle("Drag to resize");
    const tiles = handle.previousSibling as HTMLElement;
    for (const tile of Array.from(tiles.children) as HTMLElement[]) {
      expect(parseInt(tile.style.width, 10)).toBeGreaterThanOrEqual(56);
      expect(parseInt(tile.style.height, 10)).toBeGreaterThanOrEqual(42);
    }
  });
});

describe("computeTileSize", () => {
  it("uses the full container for a single participant", () => {
    expect(computeTileSize(280, 106, 1)).toEqual({ width: 141, height: 106 });
  });

  it("grows tile size when the container grows for the same participant count", () => {
    const before = computeTileSize(280, 106, 1);
    const after = computeTileSize(340, 156, 1);
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.height).toBeGreaterThan(before.height);
  });

  it("never shrinks below the minimum tile size", () => {
    const size = computeTileSize(180, 70, 20);
    expect(size.width).toBeGreaterThanOrEqual(56);
    expect(size.height).toBeGreaterThanOrEqual(42);
  });
});
