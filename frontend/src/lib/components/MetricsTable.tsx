/**
 * Generic, sortable, traffic-light metrics table (#284).
 *
 * App-agnostic: it knows nothing about chapters or quality metrics. Callers
 * describe their columns (label, how to read a value, optional threshold for
 * traffic-light coloring, optional totals aggregation, optional custom cell
 * render) and the component handles sorting, color-coding and the totals row.
 *
 * Coloring uses the semantic theme tokens (`--success` / `--warning` /
 * `--danger`) via `color-mix`, so it stays correct across all theme variants
 * and never introduces a hardcoded color.
 */

import { useMemo, useState, type ReactNode } from "react";

import styles from "./MetricsTable.module.css";

/** Traffic-light severity of a single cell. */
export type CellSeverity = "good" | "warn" | "bad";

/**
 * Absolute thresholds for traffic-light coloring of a numeric column.
 *
 * For `betterWhenHigher` columns (e.g. Flesch): value > `good` is green,
 * value >= `warn` is yellow, else red. For lower-is-better columns
 * (e.g. filler ratio): value < `good` is green, value <= `warn` is yellow,
 * else red.
 */
export interface MetricThreshold {
  good: number;
  warn: number;
  betterWhenHigher: boolean;
}

/** Totals-row aggregation for a column. */
export type ColumnTotal<Row> =
  | "sum"
  | "avg"
  | ((rows: Row[]) => string);

/** Column descriptor for {@link MetricsTable}. */
export interface MetricColumn<Row> {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  /** Whether the header sorts the table (default true). */
  sortable?: boolean;
  /** Numeric/string value used for sorting, thresholds and totals. */
  value?: (row: Row) => number | string;
  /** Display string; defaults to `String(value(row))`. */
  format?: (row: Row) => string;
  /** Traffic-light threshold (requires a numeric {@link MetricColumn.value}). */
  threshold?: MetricThreshold;
  /** Totals-row aggregation; omit for no total in this column. */
  total?: ColumnTotal<Row>;
  /** Full cell content override (sorting/threshold still use `value`). */
  render?: (row: Row) => ReactNode;
}

interface MetricsTableProps<Row> {
  rows: Row[];
  columns: MetricColumn<Row>[];
  getRowKey: (row: Row, index: number) => string;
  /** Label for the totals row's first cell; omit to hide the totals row. */
  totalsLabel?: string;
  /** Extra class for the row when the predicate matches (e.g. empty chapters). */
  rowClassName?: (row: Row) => string | undefined;
  /** Whether a row participates in threshold coloring (default: all rows). */
  colorRow?: (row: Row) => boolean;
  testId?: string;
}

/** CSS-module class per severity (token-based tints live in the module). */
const TINT_CLASS: Record<CellSeverity, string> = {
  good: styles.good,
  warn: styles.warn,
  bad: styles.bad,
};

/**
 * Classify a numeric value against a {@link MetricThreshold} into a
 * traffic-light severity. Exported so non-table consumers (e.g. the PDF
 * quality report) can reuse the exact same good/warn/bad boundaries.
 */
export function classify(value: number, t: MetricThreshold): CellSeverity {
  if (t.betterWhenHigher) {
    if (value > t.good) return "good";
    if (value >= t.warn) return "warn";
    return "bad";
  }
  if (value < t.good) return "good";
  if (value <= t.warn) return "warn";
  return "bad";
}

function numericValue<Row>(col: MetricColumn<Row>, row: Row): number | null {
  if (!col.value) return null;
  const raw = col.value(row);
  return typeof raw === "number" ? raw : null;
}

function cellSeverity<Row>(col: MetricColumn<Row>, row: Row): CellSeverity | null {
  if (!col.threshold) return null;
  const value = numericValue(col, row);
  if (value === null) return null;
  return classify(value, col.threshold);
}

function totalCell<Row>(col: MetricColumn<Row>, rows: Row[]): string {
  if (!col.total) return "";
  if (typeof col.total === "function") return col.total(rows);
  const values = rows
    .map((row) => numericValue(col, row))
    .filter((v): v is number => v !== null);
  if (values.length === 0) return "-";
  const sum = values.reduce((acc, v) => acc + v, 0);
  if (col.total === "sum") return String(sum);
  return (sum / values.length).toFixed(1);
}

/**
 * Render a generic metrics table with sortable headers, traffic-light
 * coloring and an optional totals row.
 */
export default function MetricsTable<Row>({
  rows,
  columns,
  getRowKey,
  totalsLabel,
  rowClassName,
  colorRow,
  testId,
}: MetricsTableProps<Row>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.value) return rows;
    const factor = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.value!(a);
      const bv = col.value!(b);
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * factor;
      }
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [rows, columns, sortKey, sortDir]);

  const toggleSort = (col: MetricColumn<Row>) => {
    if (col.sortable === false || !col.value) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  };

  const align = (col: MetricColumn<Row>) =>
    col.align ?? "center";

  const hasTotals = totalsLabel !== undefined;

  return (
    <div className={styles.container}>
      <table className={styles.table} data-testid={testId}>
        <thead>
          <tr>
            {columns.map((col) => {
              const canSort = col.sortable !== false && Boolean(col.value);
              const active = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  className={styles.th}
                  style={{ textAlign: align(col) }}
                  aria-sort={
                    active
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {canSort ? (
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => toggleSort(col)}
                      data-testid={
                        testId ? `${testId}-sort-${col.key}` : undefined
                      }
                    >
                      {col.label}
                      <span aria-hidden className={styles.sortIcon}>
                        {active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                      </span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => (
            <tr key={getRowKey(row, index)} className={rowClassName?.(row)}>
              {columns.map((col) => {
                const colorable = colorRow ? colorRow(row) : true;
                const severity = colorable ? cellSeverity(col, row) : null;
                return (
                  <td
                    key={col.key}
                    className={`${styles.td} ${severity ? TINT_CLASS[severity] : ""}`}
                    style={{ textAlign: align(col) }}
                    data-severity={severity ?? undefined}
                  >
                    {col.render
                      ? col.render(row)
                      : col.format
                        ? col.format(row)
                        : col.value
                          ? String(col.value(row))
                          : ""}
                  </td>
                );
              })}
            </tr>
          ))}
          {hasTotals && (
            <tr className={styles.totalsRow} data-testid={
              testId ? `${testId}-totals` : undefined
            }>
              {columns.map((col, colIndex) => (
                <td
                  key={col.key}
                  className={styles.td}
                  style={{ textAlign: align(col) }}
                >
                  {colIndex === 0 ? totalsLabel : totalCell(col, rows)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
