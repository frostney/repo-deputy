import type { SVGProps } from "react";

export type IconName =
  | "github"
  | "arrow-right"
  | "arrow-left"
  | "chevron-right"
  | "duplicate"
  | "drift"
  | "circular"
  | "complexity"
  | "docs"
  | "git-pull"
  | "git-branch"
  | "external"
  | "x"
  | "check"
  | "search"
  | "sparkle";

const ICON_LABELS: Record<IconName, string> = {
  github: "GitHub",
  "arrow-right": "Arrow right",
  "arrow-left": "Arrow left",
  "chevron-right": "Chevron right",
  duplicate: "Duplication",
  drift: "Drift",
  circular: "Circular dependencies",
  complexity: "Complexity",
  docs: "Documentation",
  "git-pull": "Pull request",
  "git-branch": "Branch",
  external: "External link",
  x: "Close",
  check: "Check",
  search: "Search",
  sparkle: "Sparkle",
};

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
};

export function Icon({ name, size = 16, ...rest }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    role: "img" as const,
    "aria-label": ICON_LABELS[name],
    ...rest,
  };
  switch (name) {
    case "github":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <title>GitHub</title>
          <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.54 9.54 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg {...common}>
          <title>Arrow right</title>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "arrow-left":
      return (
        <svg {...common}>
          <title>Arrow left</title>
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <title>Chevron right</title>
          <polyline points="9 6 15 12 9 18" />
        </svg>
      );
    case "duplicate":
      return (
        <svg {...common}>
          <title>Duplication</title>
          <rect x="4" y="4" width="11" height="11" />
          <rect x="9" y="9" width="11" height="11" />
        </svg>
      );
    case "drift":
      return (
        <svg {...common}>
          <title>Drift</title>
          <path d="M3 12h4l3-6 4 12 3-6h4" />
        </svg>
      );
    case "circular":
      return (
        <svg {...common}>
          <title>Circular dependencies</title>
          <circle cx="12" cy="12" r="8" />
          <polyline points="8 4 4 4 4 8" />
          <polyline points="16 20 20 20 20 16" />
        </svg>
      );
    case "complexity":
      return (
        <svg {...common}>
          <title>Complexity</title>
          <path d="M3 6h6" />
          <path d="M3 12h10" />
          <path d="M3 18h7" />
          <rect x="11" y="3" width="6" height="6" />
          <rect x="15" y="9" width="6" height="6" />
          <rect x="13" y="15" width="6" height="6" />
        </svg>
      );
    case "docs":
      return (
        <svg {...common}>
          <title>Documentation</title>
          <rect x="5" y="3" width="14" height="18" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="13" y2="16" />
        </svg>
      );
    case "git-pull":
      return (
        <svg {...common}>
          <title>Pull request</title>
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="6" cy="18" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
          <path d="M6 8.5v7" />
          <path d="M11 6h4a3 3 0 0 1 3 3v6.5" />
          <path d="M15 3l3 3-3 3" />
        </svg>
      );
    case "git-branch":
      return (
        <svg {...common}>
          <title>Branch</title>
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="6" cy="18" r="2.5" />
          <circle cx="18" cy="9" r="2.5" />
          <path d="M6 8.5v7" />
          <path d="M18 11.5v.5a4 4 0 0 1-4 4H8.5" />
        </svg>
      );
    case "external":
      return (
        <svg {...common}>
          <title>External</title>
          <path d="M14 4h6v6" />
          <path d="M20 4l-9 9" />
          <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <title>Close</title>
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <title>Check</title>
          <polyline points="4 12 10 18 20 6" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <title>Search</title>
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16l4 4" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <title>Sparkle</title>
          <path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" />
        </svg>
      );
  }
}

export function Sym({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block w-[1ch] text-center align-[-0.05em] font-[family-name:var(--font-mono)] leading-none">
      {children}
    </span>
  );
}

export function CodeText({ children }: { children: string }) {
  const parts = children.split(/`([^`]+)`/g).map((part, i) => ({
    text: part,
    key: `${part}-${i}`,
    isCode: i % 2 === 1,
  }));
  return (
    <>
      {parts.map((part) =>
        part.isCode ? (
          <code
            key={part.key}
            className="rounded border border-line-soft bg-ink-3 px-1.5 py-px font-[family-name:var(--font-mono)] text-[0.92em] text-text"
          >
            {part.text}
          </code>
        ) : (
          <span key={part.key}>{part.text}</span>
        ),
      )}
    </>
  );
}
