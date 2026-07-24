/**
 * Neutralize terminal control characters in untrusted, repository-derived text
 * before it is written to the terminal (CWE-150).
 *
 * Why this exists: values such as PR titles, author names, file paths, diff and
 * file content, finding titles and issue messages come straight from a
 * repository an attacker may control. Written raw to a terminal, embedded escape
 * bytes (ESC 0x1B and other C0/C1/DEL controls) are interpreted as ANSI/OSC
 * control sequences — letting a crafted pull request repaint or hide findings,
 * spoof gate status or counts, or drive terminal side effects (OSC 52 clipboard
 * writes, OSC 8 hyperlink spoofing).
 *
 * Why not neutralize at the console boundary: the CLI itself emits legitimate
 * ANSI SGR sequences (via `ansis`) for its own colours. Stripping every escape
 * at the boundary would break that output, and merely allow-listing the SGR
 * family would still let an attacker's own SGR sequences through — the exact
 * vector in the original report. So untrusted values are neutralized *before*
 * the CLI wraps them in its own styling, centrally in the render helpers.
 *
 * Neutralized ranges (keeping TAB and LF so layout survives):
 *   C0:  0x00–0x1F  except 0x09 (TAB) and 0x0A (LF)
 *   DEL: 0x7F
 *   C1:  0x80–0x9F
 * CR (0x0D) is intentionally neutralized too — it can return the cursor to the
 * start of the line and overwrite already-printed output.
 *
 * Each offending byte is replaced with a visible, non-interpretable token
 * (caret notation for C0/DEL, `\xNN` for C1) rather than silently dropped, so
 * tampering stays evident. Structured JSON output is deliberately left
 * untouched — JSON encoding already escapes control bytes.
 */
const CONTROL_CHAR_RE = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g;

function neutralizeChar(ch: string): string {
  const code = ch.charCodeAt(0);
  // C0 controls (0x00–0x1F) → caret notation, e.g. ESC (0x1B) → "^[".
  if (code <= 0x1f) return "^" + String.fromCharCode(code + 0x40);
  // DEL (0x7F) → "^?".
  if (code === 0x7f) return "^?";
  // C1 controls (0x80–0x9F) → hex escape, e.g. 0x9B (CSI) → "\x9B".
  return "\\x" + code.toString(16).toUpperCase().padStart(2, "0");
}

/**
 * Return `value` with terminal control characters neutralized. `undefined` and
 * `null` pass through unchanged so callers can wrap optional fields inline
 * without disturbing their truthiness checks.
 */
export function sanitizeText(value: string): string;
export function sanitizeText(value: undefined): undefined;
export function sanitizeText(value: null): null;
export function sanitizeText(
  value: string | null | undefined,
): string | null | undefined;
export function sanitizeText(
  value: string | null | undefined,
): string | null | undefined {
  return typeof value === "string"
    ? value.replace(CONTROL_CHAR_RE, neutralizeChar)
    : value;
}
