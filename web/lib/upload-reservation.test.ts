import { describe, expect, it } from "vitest";

import { reservationCutoff, reservationExpiry } from "./upload-reservation";

describe("upload reservation lifetime", () => {
  it("uses the same 24-hour boundary for acceptance and expiry", () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    expect(reservationCutoff(now).toISOString()).toBe("2026-09-12T12:00:00.000Z");
    expect(reservationExpiry(now).toISOString()).toBe("2026-09-14T12:00:00.000Z");
  });
});
