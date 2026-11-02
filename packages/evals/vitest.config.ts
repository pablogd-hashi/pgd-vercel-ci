import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 120_000,
    // LLM evals are slow and cost tokens; run files one at a time.
    fileParallelism: false,
  },
});
