/**
 * HTTP/HTTPS proxy support.
 *
 * Node's built-in `fetch` (used by the generated API client in
 * `src/api/client/core`) is backed by `undici` and does **not** automatically
 * honor `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` the way `curl`-based tools do
 * (Node 24's `NODE_USE_ENV_PROXY` flag adds that, but it's experimental and
 * unavailable on the Node versions this CLI supports, per `engines` in
 * `package.json`). Instead, we resolve the proxy env vars ourselves and
 * install an `undici.ProxyAgent` as the global dispatcher, so every `fetch()`
 * call routes through the proxy regardless of Node version.
 */
import { ProxyAgent, setGlobalDispatcher } from "undici";

/** Reads an env var case-insensitively, preferring the uppercase form. */
function getEnvValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return env[name.toUpperCase()] || env[name.toLowerCase()] || undefined;
}

/**
 * Resolves the proxy URL to use from the environment, preferring
 * `HTTPS_PROXY`/`https_proxy` and falling back to `HTTP_PROXY`/`http_proxy`.
 * Returns `undefined` when neither is set.
 */
export function resolveProxyUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return getEnvValue(env, "HTTPS_PROXY") || getEnvValue(env, "HTTP_PROXY");
}

/** The Codacy API host, consistent with how `OpenAPI.BASE` is derived in `src/index.ts`. */
function apiHost(env: NodeJS.ProcessEnv): string {
  const base = (env.CODACY_API_BASE_URL || "https://app.codacy.com").replace(/\/$/, "");
  try {
    return new URL(base).hostname;
  } catch {
    return "app.codacy.com";
  }
}

/**
 * Checks `NO_PROXY`/`no_proxy` (comma-separated list of hostnames, optionally
 * prefixed with `.` for suffix matching, or `*` to bypass everything) against
 * the Codacy API host.
 */
export function shouldBypassProxy(env: NodeJS.ProcessEnv, host: string): boolean {
  const noProxy = getEnvValue(env, "NO_PROXY");
  if (!noProxy) return false;

  const entries = noProxy
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.includes("*")) return true;

  return entries.some((entry) => {
    const pattern = entry.replace(/^\./, "");
    return host === pattern || host.endsWith(`.${pattern}`);
  });
}

/**
 * Installs an `undici.ProxyAgent` as the global dispatcher when a proxy is
 * configured via the environment. Safe to call unconditionally: when no proxy
 * env var is set (or `NO_PROXY` bypasses the Codacy API host), it's a no-op
 * and behavior is unchanged.
 *
 * Call this once, before `OpenAPI.BASE`/`OpenAPI.HEADERS` are set and before
 * any command is registered/parsed.
 */
export function configureProxyFromEnv(env: NodeJS.ProcessEnv = process.env): ProxyAgent | undefined {
  const proxyUrl = resolveProxyUrl(env);
  if (!proxyUrl) return undefined;

  if (shouldBypassProxy(env, apiHost(env))) return undefined;

  const agent = new ProxyAgent(proxyUrl);
  setGlobalDispatcher(agent);
  return agent;
}
