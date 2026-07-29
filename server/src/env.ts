import "dotenv/config";
import { hostname } from "node:os";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string(),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  BETTER_AUTH_URL: z.string().default("http://localhost:4000"),
  BETTER_AUTH_SECRET: z.string(),
  SYNC_TICKET_SECRET: z.string(),
  LIVEKIT_URL: z.string(),
  LIVEKIT_API_KEY: z.string(),
  LIVEKIT_API_SECRET: z.string(),
  REDIS_URL: z.string(),
  INSTANCE_NAME: z.string().default(hostname()),
});

export const env = envSchema.parse(process.env);
