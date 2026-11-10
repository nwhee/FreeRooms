import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Honour the "@/*" alias from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    include: [
      "lib/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "scripts/**/*.test.{ts,tsx}",
    ],
    // Node by default. Component tests opt in with `// @vitest-environment jsdom`.
    environment: "node",
    // Lets Testing Library register its automatic `cleanup` after each test.
    globals: true,
    // Adds the jest-dom matchers (toBeInTheDocument, ...) to every test file.
    setupFiles: ["@testing-library/jest-dom/vitest"],
  },
});
