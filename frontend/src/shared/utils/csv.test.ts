import { describe, it, expect } from "vitest";

import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes the header and one CRLF-terminated record per row", () => {
    const csv = toCsv(["day", "words_written"], [
      ["2026-10-01", 1200],
      ["2026-10-02", 0],
    ]);

    expect(csv).toBe("day,words_written\r\n2026-10-01,1200\r\n2026-10-02,0\r\n");
  });

  it("emits the header alone when there are no rows", () => {
    expect(toCsv(["day", "words_written"], [])).toBe("day,words_written\r\n");
  });

  it("quotes separators, quotes and newlines, doubling embedded quotes", () => {
    const csv = toCsv(["title", "note"], [
      ['Rache, kalt', 'He said "no"'],
      ["two\nlines", "trailing space "],
    ]);

    expect(csv).toBe(
      'title,note\r\n' +
        '"Rache, kalt","He said ""no"""\r\n' +
        '"two\nlines","trailing space "\r\n',
    );
  });

  it("serialises numbers without locale separators", () => {
    expect(toCsv(["n"], [[1234567]])).toBe("n\r\n1234567\r\n");
  });
});
