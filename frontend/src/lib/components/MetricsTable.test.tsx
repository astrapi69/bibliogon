import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";

import MetricsTable, { type MetricColumn } from "./MetricsTable";

interface Row {
  id: string;
  name: string;
  score: number;
}

const rows: Row[] = [
  { id: "a", name: "Alpha", score: 70 },
  { id: "b", name: "Bravo", score: 45 },
  { id: "c", name: "Charlie", score: 55 },
];

const columns: MetricColumn<Row>[] = [
  { key: "name", label: "Name", align: "left", value: (r) => r.name },
  {
    key: "score",
    label: "Score",
    value: (r) => r.score,
    threshold: { good: 60, warn: 50, betterWhenHigher: true },
    total: "avg",
  },
];

function renderTable() {
  return render(
    <MetricsTable
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.id}
      totalsLabel="Total"
      testId="t"
    />,
  );
}

describe("MetricsTable", () => {
  it("renders a totals row using the column aggregation", () => {
    renderTable();
    const totals = screen.getByTestId("t-totals");
    // avg of 70, 45, 55 = 56.7
    expect(within(totals).getByText("56.7")).toBeTruthy();
    expect(within(totals).getByText("Total")).toBeTruthy();
  });

  it("colors cells by threshold severity", () => {
    renderTable();
    const good = screen.getByText("70").closest("td")!;
    const warn = screen.getByText("55").closest("td")!;
    const bad = screen.getByText("45").closest("td")!;
    expect(good.getAttribute("data-severity")).toBe("good");
    expect(warn.getAttribute("data-severity")).toBe("warn");
    expect(bad.getAttribute("data-severity")).toBe("bad");
  });

  it("sorts ascending then descending on header click", () => {
    renderTable();
    const sortBtn = screen.getByTestId("t-sort-score");
    fireEvent.click(sortBtn);
    let bodyRows = screen
      .getAllByRole("row")
      .filter((r) => within(r).queryByText(/Alpha|Bravo|Charlie/));
    expect(within(bodyRows[0]).getByText("Bravo")).toBeTruthy();
    fireEvent.click(sortBtn);
    bodyRows = screen
      .getAllByRole("row")
      .filter((r) => within(r).queryByText(/Alpha|Bravo|Charlie/));
    expect(within(bodyRows[0]).getByText("Alpha")).toBeTruthy();
  });

  it("does not color rows excluded by colorRow", () => {
    render(
      <MetricsTable
        rows={rows}
        columns={columns}
        getRowKey={(r) => r.id}
        colorRow={(r) => r.id !== "b"}
        testId="t2"
      />,
    );
    const bad = screen.getByText("45").closest("td")!;
    expect(bad.getAttribute("data-severity")).toBeNull();
  });
});
