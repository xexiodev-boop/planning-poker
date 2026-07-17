import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The same babel transform the app build uses, so Lingui macros compile in
  // any client module a test pulls in (e.g. src/lib/export.js).
  plugins: [react({ babel: { plugins: ["@lingui/babel-plugin-lingui-macro"] } })],
  test: {
    environment: "node",
    include: ["test/**/*.spec.js"],
  },
});
