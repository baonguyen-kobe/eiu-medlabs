import { NextResponse } from "next/server";

const fullGitSha = /^[0-9a-f]{40}$/i;

function deploymentGitSha() {
  const candidates = [
    process.env.APP_GIT_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
  ];

  return (
    candidates
      .map((value) => value?.trim())
      .find((value) => value && fullGitSha.test(value)) ?? "unknown"
  );
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return NextResponse.json(
    {
      gitSha: deploymentGitSha(),
      environment:
        process.env.VERCEL_ENV === "production"
          ? "production"
          : "non-production",
      deployment: "vercel",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
