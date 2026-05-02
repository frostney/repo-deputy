"use client";

import { useState } from "react";
import type { Finding } from "./_components/data";
import { IssueDetail } from "./_components/issue-detail";
import { Landing } from "./_components/landing";
import { PRCreate } from "./_components/pr-create";
import { PROpened } from "./_components/pr-opened";
import { Results } from "./_components/results";
import { Scanning } from "./_components/scanning";
import { ThemeToggle } from "./_components/theme-toggle";

type Screen = "landing" | "scan" | "results" | "pr" | "done";
type PR = { count: number; files: number; branch: string; title: string };

const DEFAULT_PR: PR = {
  count: 4,
  files: 8,
  branch: "repo-deputy/audit-00482",
  title: "chore: deputize · clean up drift, dupes, and stale docs",
};

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [repo, setRepo] = useState("vercel/next.js");
  const [issue, setIssue] = useState<Finding | null>(null);
  const [preselected, setPreselected] = useState<string[] | null>(null);
  const [pr, setPr] = useState<PR | null>(null);

  const startAudit = (r: string) => {
    setRepo(r);
    setScreen("scan");
  };

  const goLanding = () => {
    setScreen("landing");
    setIssue(null);
    setPreselected(null);
  };

  return (
    <div className="relative z-[1] flex min-h-screen flex-col">
      <ThemeToggle />
      {screen === "landing" && <Landing onAudit={startAudit} />}
      {screen === "scan" && (
        <Scanning repo={repo} onComplete={() => setScreen("results")} />
      )}
      {screen === "results" && (
        <Results
          repo={repo}
          onOpenIssue={(f) => setIssue(f)}
          onPropose={() => {
            setPreselected(null);
            setScreen("pr");
          }}
          onHome={goLanding}
        />
      )}
      {screen === "pr" && (
        <PRCreate
          repo={repo}
          onBack={() => setScreen("results")}
          preselected={preselected}
          onSubmit={(p) => {
            setPr(p);
            setScreen("done");
          }}
        />
      )}
      {screen === "done" && (
        <PROpened
          repo={repo}
          pr={pr ?? DEFAULT_PR}
          onBack={() => setScreen("results")}
          onView={goLanding}
        />
      )}

      {issue && (
        <IssueDetail
          issue={issue}
          onClose={() => setIssue(null)}
          onPropose={(ids) => {
            setPreselected(ids);
            setScreen("pr");
          }}
        />
      )}
    </div>
  );
}
