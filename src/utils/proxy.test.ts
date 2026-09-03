/**
 * Unit tests for proxy env var resolution and dispatcher installation.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const { setGlobalDispatcherSpy, ProxyAgentSpy } = vi.hoisted(() => {
  const setGlobalDispatcherSpy = vi.fn();
  const ProxyAgentSpy = vi.fn(function (this: unknown, url: string) {
    (this as { url: string }).url = url;
  });
  return { setGlobalDispatcherSpy, ProxyAgentSpy };
});

vi.mock("undici", () => ({
  setGlobalDispatcher: setGlobalDispatcherSpy,
  ProxyAgent: ProxyAgentSpy,
}));

import { resolveProxyUrl, shouldBypassProxy, configureProxyFromEnv } from "./proxy";

describe("resolveProxyUrl", () => {
  it("returns undefined when no proxy env vars are set", () => {
    expect(resolveProxyUrl({})).toBeUndefined();
  });

  it("prefers HTTPS_PROXY over HTTP_PROXY", () => {
    expect(
      resolveProxyUrl({ HTTPS_PROXY: "http://https-proxy:8080", HTTP_PROXY: "http://http-proxy:8080" }),
    ).toBe("http://https-proxy:8080");
  });

  it("falls back to HTTP_PROXY when HTTPS_PROXY is absent", () => {
    expect(resolveProxyUrl({ HTTP_PROXY: "http://http-proxy:8080" })).toBe("http://http-proxy:8080");
  });

  it("is case-insensitive (lowercase https_proxy)", () => {
    expect(resolveProxyUrl({ https_proxy: "http://lower-https:8080" })).toBe("http://lower-https:8080");
  });

  it("is case-insensitive (lowercase http_proxy)", () => {
    expect(resolveProxyUrl({ http_proxy: "http://lower-http:8080" })).toBe("http://lower-http:8080");
  });

  it("prefers uppercase over lowercase when both are set", () => {
    expect(resolveProxyUrl({ HTTPS_PROXY: "http://upper:8080", https_proxy: "http://lower:8080" })).toBe(
      "http://upper:8080",
    );
  });
});

describe("shouldBypassProxy", () => {
  it("returns false when NO_PROXY is not set", () => {
    expect(shouldBypassProxy({}, "app.codacy.com")).toBe(false);
  });

  it("returns true for an exact host match", () => {
    expect(shouldBypassProxy({ NO_PROXY: "app.codacy.com" }, "app.codacy.com")).toBe(true);
  });

  it("returns true for a suffix match", () => {
    expect(shouldBypassProxy({ NO_PROXY: ".codacy.com" }, "app.codacy.com")).toBe(true);
  });

  it("returns true for '*'", () => {
    expect(shouldBypassProxy({ NO_PROXY: "*" }, "app.codacy.com")).toBe(true);
  });

  it("returns false for a non-matching host", () => {
    expect(shouldBypassProxy({ NO_PROXY: "example.com" }, "app.codacy.com")).toBe(false);
  });

  it("is case-insensitive (lowercase no_proxy)", () => {
    expect(shouldBypassProxy({ no_proxy: "app.codacy.com" }, "app.codacy.com")).toBe(true);
  });
});

describe("configureProxyFromEnv", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when no proxy env vars are set", () => {
    const result = configureProxyFromEnv({});
    expect(result).toBeUndefined();
    expect(ProxyAgentSpy).not.toHaveBeenCalled();
    expect(setGlobalDispatcherSpy).not.toHaveBeenCalled();
  });

  it("installs a dispatcher with the correct proxy URL when HTTPS_PROXY is set", () => {
    const result = configureProxyFromEnv({ HTTPS_PROXY: "http://proxyhost:8080" });
    expect(ProxyAgentSpy).toHaveBeenCalledWith("http://proxyhost:8080");
    expect(setGlobalDispatcherSpy).toHaveBeenCalledOnce();
    expect(result).toBeDefined();
  });

  it("installs a dispatcher using HTTP_PROXY when HTTPS_PROXY is absent", () => {
    configureProxyFromEnv({ HTTP_PROXY: "http://proxyhost:8080" });
    expect(ProxyAgentSpy).toHaveBeenCalledWith("http://proxyhost:8080");
    expect(setGlobalDispatcherSpy).toHaveBeenCalledOnce();
  });

  it("skips installing the dispatcher when NO_PROXY bypasses the Codacy API host", () => {
    const result = configureProxyFromEnv({
      HTTPS_PROXY: "http://proxyhost:8080",
      NO_PROXY: "app.codacy.com",
    });
    expect(result).toBeUndefined();
    expect(ProxyAgentSpy).not.toHaveBeenCalled();
    expect(setGlobalDispatcherSpy).not.toHaveBeenCalled();
  });

  it("respects CODACY_API_BASE_URL when checking NO_PROXY", () => {
    const result = configureProxyFromEnv({
      HTTPS_PROXY: "http://proxyhost:8080",
      NO_PROXY: "internal.example.com",
      CODACY_API_BASE_URL: "https://internal.example.com",
    });
    expect(result).toBeUndefined();
    expect(ProxyAgentSpy).not.toHaveBeenCalled();
  });
});
