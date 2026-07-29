import Redis from "ioredis";
import { env } from "../env.js";

/**
 * One shared connection for regular Redis commands (viewer presence, and
 * the publish side of chat pub/sub). A dedicated subscriber connection is
 * created separately wherever Redis's blocking SUBSCRIBE mode is needed —
 * ioredis requires a connection used for subscribing to stop accepting
 * regular commands, so it can't share this one.
 */
export const redis = new Redis(env.REDIS_URL);
