import { describe, it, expect } from "vitest";
import { sanitizeText } from "./sanitize";

describe("sanitizeText", () => {
  it("neutralizes a bare ESC byte (0x1B) with caret notation", () => {
    expect(sanitizeText("\x1b")).toBe("^[");
    // The raw ESC byte must be gone.
    expect(sanitizeText("\x1b")).not.toContain("\x1b");
  });

  it("neutralizes an SGR colour sequence so it can't repaint output", () => {
    // The originally reported vector: a value carrying its own colour codes.
    const payload = "\x1b[31mfake error\x1b[0m";
    const out = sanitizeText(payload);
    expect(out).toBe("^[[31mfake error^[[0m");
    expect(out).not.toContain("\x1b");
    // The visible text survives.
    expect(out).toContain("fake error");
  });

  it("neutralizes OSC sequences (e.g. clipboard/hyperlink) — no raw ESC or BEL", () => {
    const payload = "\x1b]52;c;cGF5bG9hZA==\x07";
    const out = sanitizeText(payload);
    expect(out).not.toContain("\x1b");
    expect(out).not.toContain("\x07");
    expect(out).toContain("^["); // ESC (0x1B) → ^[ (the ] is a literal char, kept)
    expect(out).toContain("^G"); // BEL (0x07) → ^G
  });

  it("neutralizes DEL (0x7F) and carriage return (0x0D)", () => {
    expect(sanitizeText("a\x7fb")).toBe("a^?b");
    // CR can overwrite already-printed output, so it is neutralized too.
    expect(sanitizeText("visible\rHIDDEN")).toBe("visible^MHIDDEN");
  });

  it("neutralizes C1 control bytes (0x80–0x9F) with a hex escape", () => {
    // 0x9B is the single-byte CSI introducer.
    expect(sanitizeText("x\x9by")).toBe("x\\x9By");
    expect(sanitizeText("\x80")).toBe("\\x80");
  });

  it("keeps TAB and LF so layout and multi-line text survive", () => {
    expect(sanitizeText("a\tb\nc")).toBe("a\tb\nc");
  });

  it("leaves ordinary text and non-ASCII printable characters unchanged", () => {
    expect(sanitizeText("Add new feature → done ✓")).toBe(
      "Add new feature → done ✓",
    );
    expect(sanitizeText("src/index.ts:10")).toBe("src/index.ts:10");
  });

  it("passes undefined and null through unchanged", () => {
    expect(sanitizeText(undefined)).toBeUndefined();
    expect(sanitizeText(null)).toBeNull();
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizeText("")).toBe("");
  });
});
