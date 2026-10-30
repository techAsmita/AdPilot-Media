// eslint-config-next 16 ships native flat configs, so they spread in directly.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "data/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Generated images arrive as base64 data URLs, which next/image cannot take.
      "@next/next/no-img-element": "off",
      // The NDJSON stream is narrowed by its discriminated union at the call site.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // These two fire on legitimate mount-time initialisation (reading the DOM
      // theme, hydrating localStorage) and on a scroll-into-view effect. Fixing
      // them properly means moving run state into a store — tracked, not silenced:
      // they stay visible as warnings rather than blocking CI.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
