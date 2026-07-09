import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Several test files share the same real local Postgres. Their afterEach
    // cleanup is scoped to each file's own test-created rows, but running
    // files in parallel would still interleave transactions against the same
    // tables — running one at a time keeps that simple and predictable.
    fileParallelism: false,
  },
});
