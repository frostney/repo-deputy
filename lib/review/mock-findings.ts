import type { Finding } from "@/lib/review/types";

export const SEEDED_DEMO_FINDINGS: Finding[] = [
  {
    id: "demo-readme-npm-dev",
    category: "docs-drift",
    severity: "high",
    title: "README setup command is stale",
    summary: "README still documents `npm run dev`, but package.json uses `bun run dev`.",
    evidence: [
      "README says `npm run dev`.",
      "package.json defines the Bun dev workflow.",
    ],
    files: ["README.md", "package.json"],
    suggestedFix: "Update README to use Bun commands.",
    confidence: 0.91,
  },
  {
    id: "demo-install-pnpm",
    category: "docs-drift",
    severity: "medium",
    title: "Installation docs use pnpm instead of Bun",
    summary: "Installation docs mention `pnpm install`, but this project uses Bun.",
    evidence: ["Docs mention `pnpm install`.", "Repo convention is Bun."],
    files: ["README.md"],
    suggestedFix: "Change installation docs to `bun install`.",
    confidence: 0.87,
  },
  {
    id: "demo-env-provider-key",
    category: "docs-drift",
    severity: "high",
    title: ".env.example is missing OPENAI_API_KEY",
    summary:
      "A new OPENAI_API_KEY env var is used but missing from .env.example. If the code is meant to use Vercel AI Gateway, it should be renamed to AI_GATEWAY_API_KEY.",
    evidence: [
      "Changed code references `OPENAI_API_KEY`.",
      "`.env.example` does not document it.",
    ],
    files: [".env.example", "lib/ai/generate.ts"],
    suggestedFix:
      "Rename the usage to AI_GATEWAY_API_KEY and document that key in .env.example.",
    confidence: 0.89,
  },
  {
    id: "demo-duplicate-format-review-finding",
    category: "code-drift",
    severity: "medium",
    title: "New helper duplicates existing formatting logic",
    summary: "New helper `formatReviewFinding` duplicates existing `formatFinding`.",
    evidence: [
      "Changed code adds `formatReviewFinding`.",
      "Existing code already has `formatFinding`.",
    ],
    files: ["lib/review/report-markdown.ts"],
    suggestedFix: "Remove the duplicate helper and reuse `formatFinding`.",
    confidence: 0.74,
  },
  {
    id: "demo-api-audit-review-route",
    category: "docs-drift",
    severity: "high",
    title: "Docs mention a route that was renamed",
    summary: "Docs mention `/api/audit`, but the route was renamed to `/api/review`.",
    evidence: ["Docs mention `/api/audit`.", "Changed route is `/api/review`."],
    files: ["README.md", "app/api/review/route.ts"],
    suggestedFix: "Update docs and examples to use `/api/review`.",
    confidence: 0.86,
  },
  {
    id: "demo-client-server-config",
    category: "architecture-drift",
    severity: "high",
    title: "Client component imports server-only config",
    summary: "A client component imports server-only configuration.",
    evidence: [
      "Component is marked with `use client`.",
      "Component imports server-only config.",
    ],
    files: ["app/components/review-panel.tsx", "lib/config/server.ts"],
    suggestedFix:
      "Move server-only access behind an API route or pass safe values from a server component.",
    confidence: 0.82,
  },
  {
    id: "demo-memory-bun-docs-drift",
    category: "docs-drift",
    severity: "low",
    title: "Prior memory shows repeated package-manager docs drift",
    summary:
      "Prior repo memory says this repo has previously drifted on package-manager docs.",
    evidence: ["Repo memory pattern: Bun setup docs have drifted before."],
    files: ["README.md"],
    suggestedFix:
      "Prioritize package-manager docs when validating this repository's final state.",
    confidence: 0.64,
  },
];
