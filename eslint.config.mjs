import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Vendored verbatim from the AI Canvas shadcn registry so it stays
    // updatable. Kept lintable except for the rules its own style trips.
    files: ["components/aicanvas/**"],
    rules: {
      "react-hooks/refs": "off",
    },
  },
]);

export default eslintConfig;
