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
    // Test files
    "**/__tests__/**",
    "**/*.test.{ts,tsx,js,jsx}",
    "**/*.spec.{ts,tsx,js,jsx}",
  ]),
  // Override rules
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // In production nginx (docker/nginx.conf) routes /api/* and /health to
  // PocketBase, never to Next.js. Webapp routes live under /api-next/.
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^\\/api(\\/|$)/]",
          message:
            "'/api' is PocketBase's URL namespace (nginx proxies it past Next.js in production). Call webapp routes under '/api-next/', and go through the shared mutators via @/lib/pocketbase-client for PocketBase data.",
        },
        {
          selector: "TemplateElement[value.raw=/^\\/api(\\/|$)/]",
          message:
            "'/api' is PocketBase's URL namespace (nginx proxies it past Next.js in production). Call webapp routes under '/api-next/', and go through the shared mutators via @/lib/pocketbase-client for PocketBase data.",
        },
      ],
    },
  },
  // Must come after the block above so this rule config wins for these files.
  {
    files: ["src/app/api/**", "src/app/health/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "Nothing under src/app/api or src/app/health is reachable in production: nginx (docker/nginx.conf) routes '/api/*' and '/health' to PocketBase, not Next.js. Put webapp route handlers under src/app/api-next/ instead.",
        },
      ],
    },
  },
]);

export default eslintConfig;
