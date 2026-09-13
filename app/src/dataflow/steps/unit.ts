import { SERVER_URL } from '../../env';
import { getAuthHeader } from '../../services/auth/instance';

export async function issueUnitId(
  recordedAt: string,
  recordingConfig: string,
): Promise<{ unitId: string; siteId: string }> {
  const response = await fetch(`${SERVER_URL}/api/v1/units`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify({ recordedAt, recordingConfig }),
  });
  if (response.status !== 201) {
    const body = await response.text().catch(() => '');
    throw new Error(`/api/v1/units ${response.status}: ${body.slice(0, 200)}`);
  }
  const payload = await response.json() as { unitId?: unknown; siteId?: unknown };
  if (typeof payload.unitId !== 'string' || typeof payload.siteId !== 'string') {
    throw new Error('/api/v1/units returned an invalid unit reservation');
  }
  return { unitId: payload.unitId, siteId: payload.siteId };
}
