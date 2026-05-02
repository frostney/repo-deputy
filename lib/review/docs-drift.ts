import type { Finding, ReviewContext } from "@/lib/review/types";

const forbiddenProviderEnv = ["OPENAI", "API", "KEY"].join("_");
const gatewayEnv = "AI_GATEWAY_API_KEY";

export function runDocsDriftChecks(context: ReviewContext): Finding[] {
  const findings: Finding[] = [];
  const docsCorpus = getDocsCorpus(context);
  const docsText = docsCorpus.map((file) => file.content).join("\n\n");
  const usesBun = repoUsesBun(context);
  const docsChanged =
    context.scope === "repo" ||
    context.changedFiles.some((file) => isDocumentationPath(file.filename));

  if (usesBun && /\bnpm\s+run\s+dev\b/i.test(docsText)) {
    findings.push({
      id: "docs-bun-dev-command",
      category: "docs-drift",
      severity: "high",
      title: "README setup command is stale",
      summary:
        "The docs still show npm dev commands even though the repo convention is Bun.",
      evidence: [
        "Docs mention `npm run dev`.",
        "Repository package-manager convention points to Bun.",
      ],
      files: filesForFinding(["README.md", "package.json"], context),
      suggestedFix: "Update README and setup docs to use `bun run dev`.",
      confidence: 0.9,
    });
  }

  if (usesBun && /\b(?:pnpm|npm|yarn)\s+install\b/i.test(docsText)) {
    findings.push({
      id: "docs-bun-install-command",
      category: "docs-drift",
      severity: "medium",
      title: "Installation docs use a non-Bun package manager",
      summary:
        "Install instructions mention another package manager while the repo expects Bun.",
      evidence: [
        "Docs mention `pnpm install`, `npm install`, or `yarn install`.",
        "Repository package-manager convention points to Bun.",
      ],
      files: filesForFinding(["README.md", "package.json"], context),
      suggestedFix: "Replace install instructions with `bun install`.",
      confidence: 0.86,
    });
  }

  findings.push(...findEnvExampleDrift(context));
  findings.push(...findRouteRenameDrift(context, docsText, docsChanged));
  findings.push(...findDeletedFileReferences(context, docsText));

  const apiChanged = context.changedFiles.some((file) => isPublicApiPath(file.filename));
  if (apiChanged && !docsChanged) {
    findings.push({
      id: "docs-public-api-without-docs",
      category: "docs-drift",
      severity: "medium",
      title: "Public API changed without a docs update",
      summary:
        "A route or public API surface changed, but no README/docs file changed in this scan context.",
      evidence: [
        "Changed files include public API or route code.",
        "No README or docs files were changed.",
      ],
      files: context.changedFiles
        .filter((file) => isPublicApiPath(file.filename))
        .map((file) => file.filename)
        .slice(0, 6),
      suggestedFix:
        "Update README, docs, or examples to match the new public API behavior.",
      confidence: 0.72,
    });
  }

  return dedupeFindings(findings);
}

function findEnvExampleDrift(context: ReviewContext): Finding[] {
  const usedEnvVars = new Set<string>();
  for (const file of context.changedFiles.filter((entry) =>
    isRuntimeCodePath(entry.filename),
  )) {
    const text = `${file.patch ?? ""}\n${file.content ?? ""}`;
    for (const name of extractEnvVars(text)) {
      if (!name.startsWith("NEXT_PUBLIC_")) {
        usedEnvVars.add(name);
      }
    }
  }

  if (usedEnvVars.size === 0) {
    return [];
  }

  const documentedEnvVars = new Set(extractEnvVarsFromExample(context.envExample));
  const missing = [...usedEnvVars].filter((name) => !documentedEnvVars.has(name));

  return missing.map((name) => {
    const gatewayHint =
      name === forbiddenProviderEnv
        ? ` If the code is meant to use Vercel AI Gateway, rename this to ${gatewayEnv}.`
        : "";

    return {
      id: `docs-env-example-${name.toLowerCase()}`,
      category: "docs-drift" as const,
      severity: name === forbiddenProviderEnv ? ("high" as const) : ("medium" as const),
      title: `.env.example is missing ${name}`,
      summary: `Changed code reads ${name}, but the example environment file does not document it.${gatewayHint}`,
      evidence: [
        `Changed code references \`${name}\`.`,
        context.envExample
          ? "`.env.example` does not list it."
          : "`.env.example` was not found.",
      ],
      files: filesForFinding(
        [
          ...context.changedFiles
            .filter((file) => `${file.patch ?? ""}\n${file.content ?? ""}`.includes(name))
            .map((file) => file.filename),
          ".env.example",
        ],
        context,
      ),
      suggestedFix:
        name === forbiddenProviderEnv
          ? `Use ${gatewayEnv} for Vercel AI Gateway and document it in .env.example.`
          : `Add ${name} to .env.example with a placeholder value.`,
      confidence: 0.86,
    };
  });
}

function findRouteRenameDrift(
  context: ReviewContext,
  docsText: string,
  docsChanged: boolean,
): Finding[] {
  const findings: Finding[] = [];
  const renamedRoutes = context.changedFiles
    .filter((file) => file.status === "renamed" && file.previousFilename)
    .map((file) => ({
      oldRoute: routeFromFilePath(file.previousFilename ?? ""),
      newRoute: routeFromFilePath(file.filename),
      file,
    }))
    .filter((route) => route.oldRoute && route.newRoute);

  for (const route of renamedRoutes) {
    if (route.oldRoute && docsText.includes(route.oldRoute)) {
      findings.push({
        id: `docs-route-rename-${route.oldRoute.replace(/\W+/g, "-")}`,
        category: "docs-drift",
        severity: "high",
        title: "Docs mention a route that was renamed",
        summary: `Docs still reference ${route.oldRoute}, but the route was renamed to ${route.newRoute}.`,
        evidence: [
          `Docs mention \`${route.oldRoute}\`.`,
          `Changed files rename \`${route.file.previousFilename}\` to \`${route.file.filename}\`.`,
        ],
        files: filesForFinding(
          ["README.md", route.file.previousFilename ?? "", route.file.filename],
          context,
        ),
        suggestedFix: `Update docs and examples to use \`${route.newRoute}\`.`,
        confidence: 0.9,
      });
    }
  }

  const routeChanged = context.changedFiles.some((file) =>
    Boolean(routeFromFilePath(file.filename)),
  );
  if (routeChanged && !docsChanged && /\bapi\b/i.test(docsText)) {
    findings.push({
      id: "docs-route-change-without-docs",
      category: "docs-drift",
      severity: "medium",
      title: "Route changed without matching docs changes",
      summary:
        "The scanned changes include route files while existing docs appear to describe API routes.",
      evidence: [
        "Changed files include `app/api/**/route.*`.",
        "No docs files changed in the scanned change set.",
      ],
      files: context.changedFiles
        .filter((file) => Boolean(routeFromFilePath(file.filename)))
        .map((file) => file.filename),
      suggestedFix: "Check README/docs route references and update any stale API names.",
      confidence: 0.68,
    });
  }

  return findings;
}

function findDeletedFileReferences(context: ReviewContext, docsText: string): Finding[] {
  return context.changedFiles
    .filter((file) => file.status === "removed" || file.status === "renamed")
    .map((file) => file.previousFilename ?? file.filename)
    .filter((path) => path && docsText.includes(path))
    .map((path) => ({
      id: `docs-stale-file-reference-${path.replace(/\W+/g, "-")}`,
      category: "docs-drift" as const,
      severity: "medium" as const,
      title: "Docs reference a file that changed location",
      summary: `Docs still reference ${path}, but that file was removed or renamed in the scanned changes.`,
      evidence: [
        `Docs mention \`${path}\`.`,
        "The scanned changes remove or rename that path.",
      ],
      files: filesForFinding(["README.md", path], context),
      suggestedFix:
        "Update docs and examples to point at the new file path, or remove the stale reference.",
      confidence: 0.78,
    }));
}

function getDocsCorpus(context: ReviewContext) {
  return [context.readme, ...context.docsFiles].filter(
    (file): file is NonNullable<typeof file> => Boolean(file),
  );
}

function repoUsesBun(context: ReviewContext) {
  const packageManager = readString(context.packageInfo?.packageManager);
  return (
    packageManager.startsWith("bun") ||
    context.changedFiles.some((file) => /^bun\.lockb?$/.test(file.filename)) ||
    Boolean(context.packageJson?.content.match(/"packageManager"\s*:\s*"bun@/))
  );
}

function extractEnvVars(text: string) {
  const names = new Set<string>();
  for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g)) {
    names.add(match[1]);
  }
  return [...names];
}

function extractEnvVarsFromExample(file: { content: string } | null) {
  if (!file) {
    return [];
  }

  return [...file.content.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]);
}

function routeFromFilePath(path: string) {
  const match = path.match(/^app\/api\/(.+)\/route\.(?:js|ts)$/);
  if (!match) {
    return null;
  }

  const route = match[1].replace(/\/?\([^)]*\)\//g, "/");
  return `/api/${route}`.replace(/\/+/g, "/");
}

function isDocumentationPath(path: string) {
  return /(^README\.md$|^docs\/|\.mdx?$)/i.test(path);
}

function isPublicApiPath(path: string) {
  return /^app\/api\/.+\/route\.(?:js|ts)$/.test(path) || /^lib\/api\//.test(path);
}

function isRuntimeCodePath(path: string) {
  return (
    /\.(cjs|js|jsx|mjs|ts|tsx)$/i.test(path) &&
    !/(?:^|[./-])(?:test|spec)\.[cm]?[jt]sx?$/i.test(path)
  );
}

function filesForFinding(paths: string[], context: ReviewContext) {
  const existing = new Set([
    ...context.changedFiles.map((file) => file.filename),
    ...context.changedFiles
      .map((file) => file.previousFilename)
      .filter((path): path is string => Boolean(path)),
    context.readme?.path,
    context.packageJson?.path,
    context.envExample?.path,
    ...context.docsFiles.map((file) => file.path),
  ]);

  return [...new Set(paths.filter(Boolean))].filter(
    (path) => existing.has(path) || path === ".env.example",
  );
}

function dedupeFindings(findings: Finding[]) {
  return [...new Map(findings.map((finding) => [finding.id, finding])).values()];
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}
