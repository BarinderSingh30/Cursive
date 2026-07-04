import type { IncomingMessage } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./betterAuth.js";

/** Reads and verifies the Better Auth session cookie from a raw Node request's headers. */
export async function getSessionFromRequest(request: Pick<IncomingMessage, "headers">) {
  return auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
}
