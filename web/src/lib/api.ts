/**
 * Same-origin by design: in dev the Vite proxy forwards these paths to the Flash app, and in
 * prod Flash serves this bundle itself (see vite.config.ts and Main#webBundlerConfig). So no
 * base URL, no VITE_API_URL, no CORS on either side.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: 'application/json', ...init?.headers },
    ...init,
  })
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}
