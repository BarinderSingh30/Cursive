export interface ShareRequestContext {
  shareToken?: string;
  /** A stable per-browser id for a not-logged-in visitor — see useAnonIdentity.ts. */
  anonId?: string;
  /** The display name a not-logged-in visitor picked — see useAnonIdentity.ts. */
  anonName?: string;
}

/**
 * Builds the headers requireBoardRole (server) reads to resolve a share-link
 * visitor: X-Share-Token identifies which board's public link this is,
 * X-Anon-Id/X-Anon-Name only matter for a visitor with no session at all.
 * Returns undefined for the normal authenticated case (no shareToken) so
 * existing api.get/post calls that never pass a ShareRequestContext are
 * unaffected.
 */
export function shareHeaders(ctx?: ShareRequestContext): HeadersInit | undefined {
  if (!ctx?.shareToken) return undefined;
  const headers: Record<string, string> = { "X-Share-Token": ctx.shareToken };
  if (ctx.anonId) headers["X-Anon-Id"] = ctx.anonId;
  if (ctx.anonName) headers["X-Anon-Name"] = ctx.anonName;
  return headers;
}
