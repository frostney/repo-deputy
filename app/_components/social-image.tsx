import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

const size = {
  width: 1200,
  height: 630,
};

type SocialImageOptions = {
  variant: "opengraph" | "twitter";
};

export async function createSocialImage({ variant }: SocialImageOptions) {
  const star = await loadStarDataUrl();
  const isTwitter = variant === "twitter";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        background: "#0e0e10",
        color: "#ece4d0",
        fontFamily: "Georgia, serif",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          height: isTwitter ? 96 : 0,
          background: "#16161a",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: isTwitter ? "100%" : 12,
          height: isTwitter ? 8 : "100%",
          background: "#d4a24c",
        }}
      />
      {/* biome-ignore lint/performance/noImgElement: next/og ImageResponse uses img tags for embedded bitmap assets. */}
      <img
        alt=""
        src={star}
        width={isTwitter ? 330 : 400}
        height={isTwitter ? 330 : 400}
        style={{
          position: "absolute",
          left: isTwitter ? 96 : 86,
          top: isTwitter ? 150 : 115,
          objectFit: "contain",
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: isTwitter ? 488 : 510,
          top: isTwitter ? 235 : 212,
        }}
      >
        <div
          style={{
            fontSize: isTwitter ? 78 : 82,
            lineHeight: 1,
            letterSpacing: 0,
          }}
        >
          Repo Deputy
        </div>
        <div
          style={{
            marginTop: 16,
            fontFamily: "Arial, sans-serif",
            fontSize: isTwitter ? 33 : 34,
            lineHeight: 1.15,
            color: "#b5ad96",
            letterSpacing: 0,
          }}
        >
          {isTwitter
            ? "A local scanner for repository drift"
            : "Whole-repository drift scanning"}
        </div>
        <div
          style={{
            marginTop: 24,
            fontFamily: "Arial, sans-serif",
            fontSize: 28,
            lineHeight: 1.2,
            color: "#e8b962",
            letterSpacing: 0,
          }}
        >
          {isTwitter
            ? "Built for app dashboards and MCP agents."
            : "Keep AI-generated changes honest."}
        </div>
      </div>
    </div>,
    size,
  );
}

async function loadStarDataUrl() {
  const bytes = await readFile(path.join(process.cwd(), "public", "star.png"));

  return `data:image/png;base64,${bytes.toString("base64")}`;
}
