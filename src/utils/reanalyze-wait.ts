import ansis from "ansis";
import { parseISO } from "date-fns";
import { IssuesOverviewCounts } from "../api/client/models/IssuesOverviewCounts";
import { CommitDeltaIssue } from "../api/client/models/CommitDeltaIssue";
import { SeverityLevel } from "../api/client/models/SeverityLevel";
import {
  SEVERITY_DISPLAY,
  colorSeverity,
  formatDelta,
  formatDuration,
} from "./formatting";

/**
 * Shared logic for the `--reanalyze-and-wait` variant of the `repository` and
 * `pull-request` commands: poll for analysis completion, snapshot the issue
 * counts before/after, and render the deltas.
 *
 * The `repository` baseline comes from the issues-overview endpoint (counts by
 * severity / category / pattern as independent lists), so its pattern entries
 * carry no category/severity. The `pull-request` baseline comes from the raw
 * PR issue list, so its pattern entries are annotated with category + severity.
 */

/** Poll every 10 seconds. */
export const POLL_INTERVAL_MS = 10_000;
/** Give up after 20 minutes. */
export const MAX_WAIT_MS = 20 * 60_000;
/** Maximum number of per-pattern rows printed before collapsing into "… (N more)". */
export const PATTERN_LIMIT = 20;

/**
 * Timers wrapped in an object so tests can replace `sleep` with an instant
 * resolver (`vi.spyOn(timers, "sleep").mockResolvedValue()`).
 */
export const timers = {
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
};

/** Minimal spinner surface used while polling (satisfied by an `ora` instance). */
export interface SpinnerLike {
  text: string;
}

/**
 * Analysis timestamps for the HEAD commit, read from the repo/PR `/commits`
 * endpoint (first commit). The polling loop derives in-progress/done from these
 * relative to the trigger time, so callers just pass the raw timestamps.
 */
export interface AnalysisStatus {
  startedAnalysis?: string;
  endedAnalysis?: string;
}

export interface PatternBucket {
  title: string;
  category?: string;
  severity?: SeverityLevel;
  count: number;
}

/** A point-in-time count of issues across three independent dimensions. */
export interface IssueSnapshot {
  total: number;
  /** Keyed by SeverityLevel ('Error' | 'High' | 'Warning' | 'Info'). */
  bySeverity: Record<string, number>;
  /** Keyed by category name. */
  byCategory: Record<string, number>;
  /** Keyed by pattern id. */
  byPattern: Record<string, PatternBucket>;
}

export interface DeltaEntry {
  key: string;
  label: string;
  delta: number;
  category?: string;
  severity?: SeverityLevel;
}

export interface SnapshotDelta {
  totalBefore: number;
  totalAfter: number;
  netTotal: number;
  byPattern: DeltaEntry[];
  bySeverity: DeltaEntry[];
  byCategory: DeltaEntry[];
}

const SEVERITY_ORDER: SeverityLevel[] = ["Error", "High", "Warning", "Info"];

// ── Snapshot builders ────────────────────────────────────────────────────────

/**
 * Build a snapshot from a repository issues-overview response. The overview
 * exposes counts per dimension independently, so pattern buckets have no
 * category/severity.
 */
export function snapshotFromOverview(
  counts: IssuesOverviewCounts,
): IssueSnapshot {
  const bySeverity: Record<string, number> = {};
  for (const c of counts.levels) bySeverity[c.name] = c.total;

  const byCategory: Record<string, number> = {};
  for (const c of counts.categories) byCategory[c.name] = c.total;

  const byPattern: Record<string, PatternBucket> = {};
  for (const p of counts.patterns) {
    byPattern[p.id] = { title: p.title || p.id, count: p.total };
  }

  const total = counts.levels.reduce((sum, c) => sum + c.total, 0);
  return { total, bySeverity, byCategory, byPattern };
}

/**
 * Build a snapshot from a list of pull-request issues. Each issue carries its
 * pattern's category and severity, so pattern buckets are fully annotated.
 */
export function snapshotFromPrIssues(issues: CommitDeltaIssue[]): IssueSnapshot {
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byPattern: Record<string, PatternBucket> = {};
  let total = 0;

  for (const di of issues) {
    const p = di.commitIssue.patternInfo;
    total++;
    bySeverity[p.severityLevel] = (bySeverity[p.severityLevel] ?? 0) + 1;
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;

    const existing = byPattern[p.id];
    if (existing) {
      existing.count++;
    } else {
      byPattern[p.id] = {
        title: p.title || p.id,
        category: p.category,
        severity: p.severityLevel,
        count: 1,
      };
    }
  }

  return { total, bySeverity, byCategory, byPattern };
}

// ── Diffing ──────────────────────────────────────────────────────────────────

function diffCountMap(
  before: Record<string, number>,
  after: Record<string, number>,
): { key: string; delta: number }[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: { key: string; delta: number }[] = [];
  for (const key of keys) {
    const delta = (after[key] ?? 0) - (before[key] ?? 0);
    if (delta !== 0) out.push({ key, delta });
  }
  return out;
}

/** Compute per-dimension net deltas (after − before), dropping unchanged buckets. */
export function diffSnapshots(
  before: IssueSnapshot,
  after: IssueSnapshot,
): SnapshotDelta {
  // Severity — sorted by canonical order (Critical → Minor).
  const bySeverity: DeltaEntry[] = diffCountMap(
    before.bySeverity,
    after.bySeverity,
  )
    .map(({ key, delta }) => ({
      key,
      label: SEVERITY_DISPLAY[key] ?? key,
      delta,
      severity: key as SeverityLevel,
    }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity!) -
        SEVERITY_ORDER.indexOf(b.severity!),
    );

  // Category — sorted by magnitude of change.
  const byCategory: DeltaEntry[] = diffCountMap(
    before.byCategory,
    after.byCategory,
  )
    .map(({ key, delta }) => ({ key, label: key, delta }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.label.localeCompare(b.label));

  // Pattern — union of ids, annotated from whichever snapshot has the bucket.
  const patternIds = new Set([
    ...Object.keys(before.byPattern),
    ...Object.keys(after.byPattern),
  ]);
  const byPattern: DeltaEntry[] = [];
  for (const id of patternIds) {
    const beforeBucket = before.byPattern[id];
    const afterBucket = after.byPattern[id];
    const delta = (afterBucket?.count ?? 0) - (beforeBucket?.count ?? 0);
    if (delta === 0) continue;
    const bucket = afterBucket ?? beforeBucket;
    byPattern.push({
      key: id,
      label: bucket.title,
      delta,
      category: bucket.category,
      severity: bucket.severity,
    });
  }
  byPattern.sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.label.localeCompare(b.label),
  );

  return {
    totalBefore: before.total,
    totalAfter: after.total,
    netTotal: after.total - before.total,
    byPattern,
    bySeverity,
    byCategory,
  };
}

// ── Polling ──────────────────────────────────────────────────────────────────

export interface PollOptions {
  /** Epoch milliseconds captured when the reanalysis was triggered (t0). */
  triggeredAt: number;
  spinner: SpinnerLike;
  pollMs?: number;
  maxWaitMs?: number;
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
}

export interface PollResult {
  status: AnalysisStatus;
  timedOut: boolean;
}

/**
 * A new analysis is in progress when it started after we triggered the
 * reanalysis (`startedAnalysis` more recent than t0) and hasn't finished yet
 * (`startedAnalysis` more recent than `endedAnalysis`).
 */
export function isAnalysisInProgress(
  status: AnalysisStatus,
  triggeredAt: number,
): boolean {
  if (!status.startedAnalysis) return false;
  const started = parseISO(status.startedAnalysis).getTime();
  if (started <= triggeredAt) return false;
  return (
    !status.endedAnalysis ||
    started > parseISO(status.endedAnalysis).getTime()
  );
}

/**
 * The new analysis is done when it started after t0 and has since finished
 * (`endedAnalysis` is at or after `startedAnalysis`).
 */
export function isAnalysisDone(
  status: AnalysisStatus,
  triggeredAt: number,
): boolean {
  if (!status.startedAnalysis || !status.endedAnalysis) return false;
  const started = parseISO(status.startedAnalysis).getTime();
  const ended = parseISO(status.endedAnalysis).getTime();
  return started > triggeredAt && ended >= started;
}

/**
 * Two-phase poll for a freshly-triggered reanalysis:
 *  A) wait until a new analysis is in progress (or has already finished), then
 *  B) wait until it finishes.
 *
 * Both transitions are detected from the HEAD commit's analysis timestamps
 * relative to `triggeredAt` (see `isAnalysisInProgress` / `isAnalysisDone`).
 * Resolves with the latest status, or `timedOut: true` once `maxWaitMs` elapses.
 */
export async function pollForAnalysis(
  getStatus: () => Promise<AnalysisStatus>,
  opts: PollOptions,
): Promise<PollResult> {
  const pollMs = opts.pollMs ?? POLL_INTERVAL_MS;
  const maxWaitMs = opts.maxWaitMs ?? MAX_WAIT_MS;
  const now = opts.now ?? (() => Date.now());
  const { spinner, triggeredAt } = opts;
  const startedAt = now();
  const timedOut = () => now() - startedAt > maxWaitMs;

  const inProgress = (s: AnalysisStatus) => isAnalysisInProgress(s, triggeredAt);
  const done = (s: AnalysisStatus) => isAnalysisDone(s, triggeredAt);

  spinner.text = "Analysis requested. Waiting for it to start...";
  let status = await getStatus();

  // Phase A — wait until the new analysis starts (or has already finished).
  while (!inProgress(status) && !done(status)) {
    if (timedOut()) return { status, timedOut: true };
    await timers.sleep(pollMs);
    status = await getStatus();
  }

  // Phase B — analysis is running; wait for it to finish.
  if (!done(status)) {
    spinner.text = "Analysis in progress. This may take a few minutes...";
    while (!done(status)) {
      if (timedOut()) return { status, timedOut: true };
      await timers.sleep(pollMs);
      status = await getStatus();
    }
  }

  return { status, timedOut: false };
}

/**
 * Compute the analysis duration in milliseconds from a final status, or null
 * if the server didn't report both timestamps.
 */
export function durationFromStatus(status: AnalysisStatus): number | null {
  if (!status.startedAnalysis || !status.endedAnalysis) return null;
  const ms =
    parseISO(status.endedAnalysis).getTime() -
    parseISO(status.startedAnalysis).getTime();
  return ms >= 0 ? ms : null;
}

// ── Rendering ──────────────────────────────────────────────────────────────

/** Render a signed delta padded so the following label aligns within a section. */
function deltaCell(value: number, width: number): string {
  const raw = `${value > 0 ? "+" : ""}${value}`;
  const pad = " ".repeat(Math.max(0, width - raw.length));
  return formatDelta(value) + pad;
}

function cellWidth(entries: DeltaEntry[]): number {
  return entries.reduce((max, e) => {
    const raw = `${e.delta > 0 ? "+" : ""}${e.delta}`;
    return Math.max(max, raw.length);
  }, 0);
}

/** Print the human-readable delta report. */
export function renderReanalyzeReport(
  delta: SnapshotDelta,
  durationMs: number | null,
): void {
  console.log(
    ansis.bold(
      durationMs !== null
        ? `\nAnalysis finished in ${formatDuration(durationMs)}\n`
        : `\nAnalysis finished\n`,
    ),
  );

  const hasChanges =
    delta.byPattern.length > 0 ||
    delta.bySeverity.length > 0 ||
    delta.byCategory.length > 0;

  if (!hasChanges) {
    console.log(ansis.dim("No change in issues."));
  } else {
    if (delta.byPattern.length > 0) {
      console.log(ansis.bold("By pattern:"));
      const width = cellWidth(delta.byPattern);
      const shown = delta.byPattern.slice(0, PATTERN_LIMIT);
      for (const e of shown) {
        const annotation =
          e.category && e.severity
            ? ansis.dim(
                `  (${e.category} · ${SEVERITY_DISPLAY[e.severity] ?? e.severity})`,
              )
            : "";
        console.log(`  ${deltaCell(e.delta, width)}  ${e.label}${annotation}`);
      }
      const more = delta.byPattern.length - shown.length;
      if (more > 0) {
        console.log(
          ansis.dim(`  … (${more} more pattern${more === 1 ? "" : "s"} changed)`),
        );
      }
      console.log();
    }

    if (delta.bySeverity.length > 0) {
      console.log(ansis.bold("By severity:"));
      const width = cellWidth(delta.bySeverity);
      for (const e of delta.bySeverity) {
        console.log(
          `  ${deltaCell(e.delta, width)}  ${colorSeverity(e.severity!)}`,
        );
      }
      console.log();
    }

    if (delta.byCategory.length > 0) {
      console.log(ansis.bold("By category:"));
      const width = cellWidth(delta.byCategory);
      for (const e of delta.byCategory) {
        console.log(`  ${deltaCell(e.delta, width)}  ${e.label}`);
      }
      console.log();
    }
  }

  console.log(
    `In total: ${delta.totalBefore} → ${delta.totalAfter} issues  (net ${formatDelta(
      delta.netTotal,
    )})`,
  );
}

/** Build the `--output json` payload for the reanalyze-and-wait report. */
export function reanalyzeJson(
  before: IssueSnapshot,
  after: IssueSnapshot,
  delta: SnapshotDelta,
  durationMs: number | null,
): object {
  return {
    durationMs,
    durationHuman: durationMs !== null ? formatDuration(durationMs) : null,
    totals: {
      before: before.total,
      after: after.total,
      net: delta.netTotal,
    },
    deltas: {
      byPattern: delta.byPattern,
      bySeverity: delta.bySeverity,
      byCategory: delta.byCategory,
    },
  };
}
