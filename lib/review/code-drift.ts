import type { Finding, ReviewContext } from "@/lib/review/types";

const NODE_BUILTINS = new Set([
  "assert",
  "buffer",
  "crypto",
  "events",
  "fs",
  "http",
  "https",
  "net",
  "os",
  "path",
  "stream",
  "url",
  "util",
  "zlib",
]);

export function runCodeDriftChecks(context: ReviewContext): Finding[] {
  return dedupeFindings([
    ...findDuplicateHelpers(context),
    ...findClientServerBoundaryDrift(context),
    ...findDependencyDrift(context),
    ...findRouteRenameWithoutDocs(context),
  ]);
}

function findDuplicateHelpers(context: ReviewContext): Finding[] {
  const namesByNormalized = new Map<string, Set<string>>();
  const filesByName = new Map<string, Set<string>>();

  for (const file of context.changedFiles.filter((entry) =>
    isRuntimeCodeFile(entry.filename),
  )) {
    const text = `${file.patch ?? ""}\n${file.content ?? ""}`;
    for (const name of extractFunctionNames(text)) {
      const normalized = normalizeHelperName(name);
      if (!namesByNormalized.has(normalized)) {
        namesByNormalized.set(normalized, new Set());
      }
      namesByNormalized.get(normalized)?.add(name);

      if (!filesByName.has(name)) {
        filesByName.set(name, new Set());
      }
      filesByName.get(name)?.add(file.filename);
    }
  }

  const findings: Finding[] = [];
  for (const [normalized, names] of namesByNormalized) {
    const distinctNames = [...names];
    if (distinctNames.length < 2 || !normalized.includes("formatfinding")) {
      continue;
    }

    const files = distinctNames.flatMap((name) => [...(filesByName.get(name) ?? [])]);
    findings.push({
      id: `code-duplicate-helper-${normalized}`,
      category: "code-drift",
      severity: "medium",
      title: "Generated helper duplicates existing formatting logic",
      summary: `${distinctNames.join(
        " and ",
      )} look like overlapping helpers found in the repository scan.`,
      evidence: distinctNames.map((name) => `Found helper \`${name}\`.`),
      files: [...new Set(files)].slice(0, 6),
      suggestedFix:
        "Keep one formatter helper and update callers to use the existing implementation.",
      confidence: 0.74,
    });
  }

  return findings;
}

function findClientServerBoundaryDrift(context: ReviewContext): Finding[] {
  return context.changedFiles
    .filter((file) => isRuntimeCodeFile(file.filename))
    .filter((file) => {
      const content = file.content ?? file.patch ?? "";
      return /^\s*["']use client["']/m.test(content);
    })
    .filter((file) => {
      const content = `${file.patch ?? ""}\n${file.content ?? ""}`;
      return (
        /from\s+["']@\/lib\/(?:ai|memory|server|config)\b/.test(content) ||
        /from\s+["']server-only["']/.test(content) ||
        /process\.env\.(?!NEXT_PUBLIC_)[A-Z][A-Z0-9_]+/.test(content)
      );
    })
    .map((file) => ({
      id: `code-client-server-config-${file.filename.replace(/\W+/g, "-")}`,
      category: "architecture-drift" as const,
      severity: "high" as const,
      title: "Client component imports server-only configuration",
      summary:
        "A client component appears to import server-only modules or private environment variables.",
      evidence: [
        `\`${file.filename}\` is marked with \`use client\`.`,
        "The file references server-only modules or non-public environment variables.",
      ],
      files: [file.filename],
      suggestedFix:
        "Move server-only code behind an API route/server component, or pass safe public data as props.",
      confidence: 0.82,
    }));
}

function findDependencyDrift(context: ReviewContext): Finding[] {
  const packageNames = new Set<string>();

  for (const file of context.changedFiles.filter((entry) =>
    isRuntimeCodeFile(entry.filename),
  )) {
    const text = `${file.patch ?? ""}\n${file.content ?? ""}`;
    for (const importPath of extractImports(text)) {
      const packageName = packageNameFromImport(importPath);
      if (packageName) {
        packageNames.add(packageName);
      }
    }
  }

  if (!context.packageInfo || packageNames.size === 0) {
    return [];
  }

  const declared = new Set([
    ...Object.keys(readRecord(context.packageInfo.dependencies)),
    ...Object.keys(readRecord(context.packageInfo.devDependencies)),
    ...Object.keys(readRecord(context.packageInfo.peerDependencies)),
    ...Object.keys(readRecord(context.packageInfo.optionalDependencies)),
  ]);

  const missing = [...packageNames].filter((name) => !declared.has(name));
  if (missing.length === 0) {
    return [];
  }

  return [
    {
      id: "dependency-imports-not-in-package-json",
      category: "dependency-drift",
      severity: "medium",
      title: "Changed code imports packages not declared in package.json",
      summary:
        "The scanned code references external packages that are not listed in package.json.",
      evidence: missing.map((name) => `Imported package \`${name}\` is not declared.`),
      files: filesWithMissingImports(context, missing),
      suggestedFix:
        "Add the missing dependencies with Bun, or remove the imports if they are accidental.",
      confidence: 0.76,
    },
  ];
}

function findRouteRenameWithoutDocs(context: ReviewContext): Finding[] {
  if (context.scope === "repo") {
    return [];
  }

  const docsChanged = context.changedFiles.some((file) =>
    /(^README\.md$|^docs\/|\.mdx?$)/i.test(file.filename),
  );

  if (docsChanged) {
    return [];
  }

  return context.changedFiles
    .filter((file) => file.status === "renamed")
    .filter((file) => file.previousFilename && routeFromPath(file.previousFilename))
    .map((file) => ({
      id: `code-route-renamed-docs-unchanged-${file.filename.replace(/\W+/g, "-")}`,
      category: "code-drift" as const,
      severity: "medium" as const,
      title: "Route was renamed but docs did not change",
      summary:
        "A route file moved to a new API path, but docs or examples were not updated.",
      evidence: [
        `Route changed from \`${routeFromPath(
          file.previousFilename ?? "",
        )}\` to \`${routeFromPath(file.filename)}\`.`,
        "No README or docs files changed.",
      ],
      files: [file.previousFilename ?? "", file.filename].filter(Boolean),
      suggestedFix: "Check docs, examples, and README route references before merging.",
      confidence: 0.73,
    }));
}

function extractFunctionNames(text: string) {
  const names = new Set<string>();

  for (const match of text.matchAll(
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(match[1]);
  }

  for (const match of text.matchAll(
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
  )) {
    names.add(match[1]);
  }

  return [...names];
}

function normalizeHelperName(name: string) {
  return name
    .toLowerCase()
    .replace(/review|deputy|generated|new/g, "")
    .replace(/\W+/g, "");
}

function extractImports(text: string) {
  const imports = new Set<string>();
  for (const match of text.matchAll(
    /(?:import\s+(?:type\s+)?[^'"]*from\s+|import\s*\(|require\s*\()['"]([^'"]+)['"]/g,
  )) {
    imports.add(match[1]);
  }
  return [...imports];
}

function packageNameFromImport(importPath: string) {
  if (
    importPath.startsWith(".") ||
    importPath.startsWith("@/") ||
    importPath.startsWith("node:")
  ) {
    return null;
  }

  const root = importPath.startsWith("@")
    ? importPath.split("/").slice(0, 2).join("/")
    : importPath.split("/")[0];

  if (NODE_BUILTINS.has(root)) {
    return null;
  }

  return root;
}

function filesWithMissingImports(context: ReviewContext, missing: string[]) {
  return context.changedFiles
    .filter((file) => {
      const text = `${file.patch ?? ""}\n${file.content ?? ""}`;
      return missing.some(
        (name) => text.includes(`"${name}`) || text.includes(`'${name}`),
      );
    })
    .map((file) => file.filename)
    .slice(0, 8);
}

function routeFromPath(path: string) {
  const match = path.match(/^app\/api\/(.+)\/route\.(?:js|ts)$/);
  return match ? `/api/${match[1]}` : null;
}

function isRuntimeCodeFile(path: string) {
  return (
    /\.(cjs|js|jsx|mjs|ts|tsx)$/i.test(path) &&
    !/\.d\.ts$/i.test(path) &&
    !/(?:^|[./-])(?:test|spec)\.[cm]?[jt]sx?$/i.test(path)
  );
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dedupeFindings(findings: Finding[]) {
  return [...new Map(findings.map((finding) => [finding.id, finding])).values()];
}
