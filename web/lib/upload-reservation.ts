export const UPLOAD_RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;

export function reservationCutoff(now = new Date()): Date {
  return new Date(now.getTime() - UPLOAD_RESERVATION_TTL_MS);
}

export function reservationExpiry(now = new Date()): Date {
  return new Date(now.getTime() + UPLOAD_RESERVATION_TTL_MS);
}
