/**
 * Unit tests for the update notice (`maybeNotifyUpdate`).
 *
 * `update-notifier` is fully mocked so no network call or background process
 * happens. These tests pin the behavior we own: the `table`-only gate, the
 * branded opt-out env var, that the notifier is always constructed (to warm the
 * cache), and that the helper never throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted so the spies exist before the mock factory and the module under test load.
const { notifySpy, updateNotifierSpy } = vi.hoisted(() => {
  const notifySpy = vi.fn();
  const updateNotifierSpy = vi.fn(() => ({ notify: notifySpy }));
  return { notifySpy, updateNotifierSpy };
});

// update-check.ts does `import updateNotifier from "update-notifier"`, so the
// mock must expose the constructor as the default export.
vi.mock("update-notifier", () => ({ default: updateNotifierSpy }));

import { maybeNotifyUpdate } from "./update-check";

describe("maybeNotifyUpdate", () => {
  beforeEach(() => {
    delete process.env.CODACY_DISABLE_UPDATE_CHECK;
  });

  afterEach(() => {
    vi.clearAllMocks(); // clears call history but keeps the default mock impl
    delete process.env.CODACY_DISABLE_UPDATE_CHECK;
  });

  it("shows the notice in table mode (globally, npm i -g hint)", () => {
    maybeNotifyUpdate("table");
    expect(updateNotifierSpy).toHaveBeenCalledOnce();
    expect(notifySpy).toHaveBeenCalledWith({ isGlobal: true });
  });

  it("shows the notice when no format is given (treated as table)", () => {
    maybeNotifyUpdate(undefined);
    expect(notifySpy).toHaveBeenCalledWith({ isGlobal: true });
  });

  it("never shows the notice in json mode", () => {
    maybeNotifyUpdate("json");
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it("still constructs the notifier in json mode to warm the cache", () => {
    maybeNotifyUpdate("json");
    expect(updateNotifierSpy).toHaveBeenCalledOnce(); // cache refresh scheduled
    expect(notifySpy).not.toHaveBeenCalled(); // but no notice printed
  });

  it("honors the CODACY_DISABLE_UPDATE_CHECK opt-out", () => {
    process.env.CODACY_DISABLE_UPDATE_CHECK = "1";
    maybeNotifyUpdate("table");
    expect(updateNotifierSpy).not.toHaveBeenCalled();
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it("feeds update-notifier the package name, version and a check interval", () => {
    maybeNotifyUpdate("table");
    expect(updateNotifierSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pkg: expect.objectContaining({
          name: expect.any(String),
          version: expect.any(String),
        }),
        updateCheckInterval: expect.any(Number),
      }),
    );
  });

  it("never throws, even if update-notifier blows up", () => {
    updateNotifierSpy.mockImplementationOnce(() => {
      throw new Error("registry exploded");
    });
    expect(() => maybeNotifyUpdate("table")).not.toThrow();
  });
});
