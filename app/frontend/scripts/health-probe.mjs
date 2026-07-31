export const defaultHealthProbeTimeoutMs = 2_000;

export async function isHttpEndpointReady(
  url,
  { timeoutMs = defaultHealthProbeTimeoutMs } = {}
) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}
