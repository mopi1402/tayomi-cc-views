import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";

// The package's own sast gate, so the future standalone repo has one on day one.
// Mirrors the monorepo root's rule decisions (two false-positive machines off).
export default [
  { ignores: ["dist/**", "node_modules/**", "**/*.test.ts"] },
  security.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser, sourceType: "module" },
    rules: {
      "security/detect-object-injection": "off",
      "security/detect-non-literal-fs-filename": "off",
    },
  },
];
