import { describe, expect, it } from "vitest";
import testVector from "../../tests/unit-files-v1.json";
import { unitFilesSha256, validateUnitFiles } from "./unit-files";

describe("unit files", () => {
  it("accepts arbitrary file formats and is stable regardless of file order", () => {
    expect(unitFilesSha256(testVector.unitId, testVector.files)).toBe(testVector.sha256);
    expect(unitFilesSha256(testVector.unitId, [...testVector.files].reverse())).toBe(testVector.sha256);
    expect(validateUnitFiles(testVector.unitId, testVector.sha256, testVector.files)).toBeNull();
  });

  it("rejects duplicate, unsafe and changed file entries", () => {
    expect(validateUnitFiles(testVector.unitId, testVector.sha256, [testVector.files[0], testVector.files[0]]))
      .toBe("invalid unit file");
    expect(validateUnitFiles(testVector.unitId, testVector.sha256,
      [{ ...testVector.files[0], path: "../session.mcap" }])).toBe("invalid unit file");
    expect(validateUnitFiles(testVector.unitId, testVector.sha256,
      [{ ...testVector.files[0], bytes: 5 }, testVector.files[1]])).toBe("unit files SHA-256 mismatch");
  });
});
