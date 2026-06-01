import { execSync } from "child_process";

export interface RepoContext {
  provider: string;
  organization: string;
  repository: string;
}

const HOST_TO_PROVIDER: Record<string, string> = {
  "github.com": "gh",
  "gitlab.com": "gl",
  "bitbucket.org": "bb",
};

const SSH_REGEX = /^git@([^:]+):([^/]+)\/([^/.]+?)(?:\.git)?$/;
const HTTPS_REGEX = /^https?:\/\/([^/]+)\/([^/]+)\/([^/.]+?)(?:\.git)?$/;

export function parseGitRemoteUrl(url: string): RepoContext | null {
  const match = url.match(SSH_REGEX) || url.match(HTTPS_REGEX);
  if (!match) return null;

  const [, host, org, repo] = match;
  const provider = HOST_TO_PROVIDER[host];
  if (!provider) return null;

  return { provider, organization: org, repository: repo };
}

export function getGitRemoteUrl(remoteName = "origin"): string | null {
  try {
    return execSync(`git remote get-url ${remoteName}`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export function detectRepoContext(): RepoContext {
  const url = getGitRemoteUrl();
  if (!url) {
    throw new Error(
      "Could not detect repository from git remote. " +
        "Specify <provider> <organization> <repository> explicitly, " +
        "or ensure you are inside a git repository with an 'origin' remote.",
    );
  }

  const parsed = parseGitRemoteUrl(url);
  if (!parsed) {
    const supported = Object.entries(HOST_TO_PROVIDER)
      .map(([host, code]) => `${host} (${code})`)
      .join(", ");
    throw new Error(
      `Could not determine provider from git remote URL '${url}'. ` +
        `Supported providers: ${supported}.`,
    );
  }

  return parsed;
}
