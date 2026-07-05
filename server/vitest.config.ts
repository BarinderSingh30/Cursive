import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Several test files share the same real local Postgres and clean up
    // shared tables (Conversation/Message/Friendship) in afterEach without
    // scoping to their own rows. Running test files in parallel (Vitest's
    // default) lets one file's cleanup wipe out another's in-flight data —
    // forcing them to run one at a time removes that race entirely.
    fileParallelism: false,
  },
});
