/**
 * Test-only helpers. Excluded from the published build via tsconfig.build.json.
 */

/**
 * Joined `console.log` output with ANSI color/style codes stripped, so
 * assertions can match plain text — `dim()` otherwise splits a glyph from its
 * name with a reset sequence. Assumes `console.log` has been replaced with a
 * spy/mock (e.g. `vi.spyOn(console, "log").mockImplementation(() => {})`).
 */
export function consoleOutput(): string {
  const calls = (console.log as unknown as { mock: { calls: unknown[][] } })
    .mock.calls;
  return calls
    .map((c) => c[0])
    .join("\n")
    .replace(/\x1b\[[0-9;]*m/g, "");
}
