import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";

// The package's own sast gate, so the future standalone repo has one on day one.
// Mirrors the monorepo root's rule decisions (two false-positive machines off).

// `.length` is an integer and never negative, so every comparison below asks whether it is non-zero the long way round.
// `if (xs.length)` says the same thing, and the comparison only makes a reader check whether something subtler was meant.
// Each spelling is listed rather than matched loosely: a selector is read by whoever adds one, and a vague one would
// start refusing the comparisons that DO carry a threshold.
const REDUNDANT_LENGTH = [
  [">", 0],
  [">=", 1],
  ["!==", 0],
  ["!=", 0],
].map(([operator, bound]) => ({
  selector: `BinaryExpression[operator="${operator}"][left.property.name="length"][right.value=${bound}]`,
  message: `a length is a non-negative integer: write \`if (xs.length)\`, not \`xs.length ${operator} ${bound}\``,
}));

export default [
  { ignores: ["dist/**", "node_modules/**", "**/*.test.ts"] },
  security.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser, sourceType: "module" },
    rules: {
      "security/detect-object-injection": "off",
      "security/detect-non-literal-fs-filename": "off",
      "no-restricted-syntax": ["error", ...REDUNDANT_LENGTH],
    },
  },
];
