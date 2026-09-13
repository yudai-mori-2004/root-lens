import { describe, expect, it } from "vitest";

import { createUnitId, UNIT_ID_RE } from "./unit-id";

describe("unit identity", () => {
  it("contains an anonymous site, millisecond UTC time, and random suffix", () => {
    const unitId = createUnitId("bakery-01", new Date("2026-09-30T04:40:55.123Z"));
    expect(unitId).toMatch(/^unit_bakery-01_20260930T044055123Z_[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(UNIT_ID_RE.test(unitId)).toBe(true);
  });

  it("rejects a site label that could break object-key structure", () => {
    expect(() => createUnitId("../real-store", new Date())).toThrow("Invalid site id");
  });
});
