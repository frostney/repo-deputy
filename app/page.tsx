"use client";

import { useState } from "react";
import type { Finding, ScanResult } from "./_components/data";
import { IssueDetail } from "./_components/issue-detail";
import { Landing } from "./_components/landing";
import { PRCreate } from "./_components/pr-create";
import { PROpened } from "./_components/pr-opened";
import type { PullRequestDraft } from "./_components/pr-data";
import { Results } from "./_components/results";
import { Scanning } from "./_components/scanning";
import { ThemeToggle } from "./_components/theme-toggle";

type Screen = "landing" | "scan" | "results" | "pr" | "done";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [repo, setRepo] = useState("vercel/next.js");
  const [issue, setIssue] = useState<Finding | null>(null);
  const [preselected, setPreselected] = useState<string[] | null>(null);
  const [pr, setPr] = useState<PullRequestDraft | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const startAudit = (r: string) => {
    setRepo(r);
    setScanResult(null);
    setPr(null);
    setScreen("scan");
  };

  const goLanding = () => {
    setScreen("landing");
    setIssue(null);
    setPreselected(null);
    setPr(null);
  };

  return (
    <div className="relative z-[1] flex min-h-screen flex-col">
      <ThemeToggle />
      {screen === "landing" && <Landing onAudit={startAudit} />}
      {screen === "scan" && (
        <Scanning
          repo={repo}
          onComplete={(result) => {
            setScanResult(result);
            setScreen("results");
          }}
        />
      )}
      {screen === "results" && (
        <Results
          repo={repo}
          scanResult={scanResult}
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
          scanResult={scanResult}
          onBack={() => setScreen("results")}
          preselected={preselected}
          onSubmit={(p) => {
            setPr(p);
            setScreen("done");
          }}
        />
      )}
      {screen === "done" && pr && (
        <PROpened
          repo={repo}
          pr={pr}
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
