import { z } from "zod";

export const callTokenResponseSchema = z.object({
  token: z.string(),
  url: z.string(),
});
export type CallTokenResponse = z.infer<typeof callTokenResponseSchema>;
