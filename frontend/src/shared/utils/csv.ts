/**
 * Serialise tabular data as RFC-4180 CSV text.
 *
 * Fully generic: no application imports, no DOM, no framework — the
 * value is a plain string the caller downloads, uploads or compares.
 *
 * Quoting follows RFC 4180: a field is wrapped in double quotes when it
 * contains the separator, a double quote, a CR or LF, or leading/trailing
 * whitespace (which spreadsheets would otherwise swallow), and embedded
 * double quotes are doubled. Records are terminated by CRLF, including
 * the last one, which is what Excel and Python's `csv.writer` produce.
 *
 * Library-First note (#388): a CSV *writer* is ~15 lines of quoting rules
 * and nothing else — `papaparse` (45 kB) earns its size on the *parsing*
 * side (streaming, type inference, malformed-input recovery), none of
 * which applies to emitting rows we already hold in memory.
 *
 * @param header - Column names, written as the first record.
 * @param rows - One array of cell values per record, in column order.
 * @param separator - Field separator; defaults to `","`.
 * @returns The CSV document as a string.
 *
 * @example
 * ```ts
 * const csv = toCsv(["day", "words_written"], [["2026-10-01", 1200]]);
 * downloadBlob(new Blob([csv], { type: "text/csv" }), "history.csv");
 * ```
 */
export function toCsv(
  header: readonly string[],
  rows: ReadonlyArray<readonly CsvCell[]>,
  separator = ",",
): string {
  const records = [header, ...rows];
  return records
    .map((record) => record.map((cell) => quote(cell, separator)).join(separator) + "\r\n")
    .join("");
}

/** A single CSV cell. `null` / `undefined` are written as an empty field. */
export type CsvCell = string | number | boolean | null | undefined;

function quote(cell: CsvCell, separator: string): string {
  if (cell === null || cell === undefined) return "";
  const text = typeof cell === "number" || typeof cell === "boolean" ? String(cell) : cell;
  const needsQuotes =
    text.includes(separator) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r") ||
    text !== text.trim();
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}
