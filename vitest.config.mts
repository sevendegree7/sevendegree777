import { defineConfig } from "vitest/config";

// tests live next to the code they cover. only pure modules for now - nothing
// here renders a component or talks to supabase.
export default defineConfig({
  // resolves the `@/` alias out of tsconfig.json
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
