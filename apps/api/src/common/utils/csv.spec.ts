import { describe, expect, it } from "vitest";
import { findColumnIndex, parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    expect(parseCsv('name,note\n"Doe, John","said ""hi"""')).toEqual([
      ["name", "note"],
      ["Doe, John", 'said "hi"'],
    ]);
  });

  it("handles CRLF and skips empty trailing lines", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("findColumnIndex", () => {
  it("returns the CSV header position, not the candidate index", () => {
    const header = ["last name", "first name", "email"];
    expect(findColumnIndex(header, ["first name", "firstname"])).toBe(1);
    expect(findColumnIndex(header, ["email", "e-mail"])).toBe(2);
    expect(findColumnIndex(header, ["missing"])).toBe(-1);
  });
});

describe("toCsv", () => {
  it("escapes cells containing separators", () => {
    const csv = toCsv(["name", "note"], [["Doe, John", 'said "hi"']]);
    expect(csv).toBe('name,note\r\n"Doe, John","said ""hi"""\r\n');
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Doe, John", 'said "hi"'],
    ]);
  });
});
