import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "../api/client.js";
import { CreateGroupDialog } from "./CreateGroupDialog.js";

vi.mock("../api/client.js", () => ({
  api: { post: vi.fn() },
}));

vi.mock("../friends/useFriends.js", () => ({
  useFriends: () => ({
    friends: [
      { id: "f1", email: "alice@example.com", name: "Alice" },
      { id: "f2", email: "bob@example.com", name: "Bob" },
      { id: "f3", email: "carol@example.com", name: "Carol" },
    ],
  }),
}));

async function openDialog() {
  const user = userEvent.setup();
  render(<CreateGroupDialog onCreated={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "+ New group" }));
  return user;
}

describe("CreateGroupDialog", () => {
  it("does not show any friends until a search is typed", async () => {
    await openDialog();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.queryByText("Carol")).not.toBeInTheDocument();
  });

  it("adds a friend as a chip when selected from search, and removes them from further search results", async () => {
    const user = await openDialog();

    await user.type(screen.getByPlaceholderText("Search friends…"), "ali");
    await user.click(screen.getByText("Alice"));

    expect(screen.getByText("Alice ✕")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search friends…"), "ali");
    expect(screen.getByText(/no friends found/i)).toBeInTheDocument();
  });

  it("removes a selected friend when their chip's remove button is clicked", async () => {
    const user = await openDialog();

    await user.type(screen.getByPlaceholderText("Search friends…"), "ali");
    await user.click(screen.getByText("Alice"));
    expect(screen.getByText("Alice ✕")).toBeInTheDocument();

    await user.click(screen.getByText("Alice ✕"));
    expect(screen.queryByText("Alice ✕")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search friends…"), "ali");
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("disables Create until at least one member is selected", async () => {
    const user = await openDialog();

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Search friends…"), "ali");
    await user.click(screen.getByText("Alice"));

    expect(screen.getByRole("button", { name: "Create" })).not.toBeDisabled();
  });

  it("submits the group name and selected member emails, then resets", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "group-1" });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<CreateGroupDialog onCreated={onCreated} />);
    await user.click(screen.getByRole("button", { name: "+ New group" }));

    await user.type(screen.getByPlaceholderText("Group name"), "Weekend Trip");
    await user.type(screen.getByPlaceholderText("Search friends…"), "ali");
    await user.click(screen.getByText("Alice"));
    await user.type(screen.getByPlaceholderText("Search friends…"), "bob");
    await user.click(screen.getByText("Bob"));

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(api.post).toHaveBeenCalledWith("/api/chat/conversations/group", {
      name: "Weekend Trip",
      memberEmails: ["alice@example.com", "bob@example.com"],
    });
    expect(onCreated).toHaveBeenCalledWith("group-1");
  });
});
