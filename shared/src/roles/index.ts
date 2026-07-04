import { z } from "zod";

export const boardRoleSchema = z.enum(["owner", "collaborator", "viewer"]);
export type BoardRole = z.infer<typeof boardRoleSchema>;

const ROLE_RANK: Record<BoardRole, number> = {
  viewer: 0,
  collaborator: 1,
  owner: 2,
};

/** True if `role` grants at least as much access as `minimum` (owner > collaborator > viewer). */
export function roleAtLeast(role: BoardRole | null | undefined, minimum: BoardRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
