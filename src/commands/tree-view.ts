import { pickDeep } from "../utils/output";
import {
  formatGrade,
  formatCountCell,
  formatCoverageCell,
} from "../utils/formatting";
import { DirectoryWithAnalysisInfo } from "../api/client/models/DirectoryWithAnalysisInfo";
import { FileWithAnalysisInfo } from "../api/client/models/FileWithAnalysisInfo";

/**
 * Shared presentation helpers for the `ls` and `directories` commands: row
 * markers, the metric columns, and JSON projections. Kept in one place so the
 * two commands render identically and don't duplicate this logic.
 */

// Row markers (no emojis, for terminal safety — same Unicode family as the ⊙
// the CLI already ships): ▸ folder, dim · file; children use a └─ connector.
export const FOLDER_GLYPH = "▸";
export const FILE_GLYPH = "·";
export const CHILD_CONNECTOR = "    └─ ";

export const TABLE_HEAD = [
  "Name",
  "Grade",
  "Issues",
  "Complexity",
  "Duplication",
  "Coverage",
];

// Metric fields common to directories and files; directories add name/nrFiles.
const METRIC_JSON_FIELDS = [
  "path",
  "gradeLetter",
  "totalIssues",
  "complexity",
  "numberOfClones",
  "coverageWithDecimals",
];
export const DIR_JSON_FIELDS = [...METRIC_JSON_FIELDS, "name", "nrFiles"];
export const FILE_JSON_FIELDS = METRIC_JSON_FIELDS;

/** Last path segment of a repository-relative path. */
export function basename(filePath: string): string {
  const segments = filePath.split("/");
  return segments[segments.length - 1] || filePath;
}

/** Header display path, e.g. "/my-repo/src/website" ("/my-repo" at the root). */
export function displayPath(repository: string, targetPath: string): string {
  return "/" + [repository, targetPath].filter(Boolean).join("/");
}

/**
 * The five metric cells shared by directory and file rows: Grade, Issues,
 * Complexity, Duplication, Coverage. Complexity is the highest under the path
 * (surfaces hotspots); Duplication is the number of cloned blocks — matching
 * Codacy's UI. Missing metrics render as a dim "-".
 */
export function metricCells(
  item: DirectoryWithAnalysisInfo | FileWithAnalysisInfo,
): string[] {
  return [
    formatGrade(item.gradeLetter),
    formatCountCell(item.totalIssues),
    formatCountCell(item.complexity),
    formatCountCell(item.numberOfClones),
    formatCoverageCell(item.coverageWithDecimals),
  ];
}

/** JSON projection of a directory item (fields shown in the table). */
export function projectDir(d: DirectoryWithAnalysisInfo): Record<string, unknown> {
  return pickDeep(d, DIR_JSON_FIELDS);
}

/** JSON projection of a file item (fields shown in the table). */
export function projectFile(f: FileWithAnalysisInfo): Record<string, unknown> {
  return pickDeep(f, FILE_JSON_FIELDS);
}
