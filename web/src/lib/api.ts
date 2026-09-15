/**
 * Same-origin by design: in dev the Vite proxy forwards these paths to the Flash app, and in
 * prod Flash serves this bundle itself (see vite.config.ts and Main#webBundlerConfig). So no
 * base URL, no VITE_API_URL, no CORS on either side.
 */
/**
 * Sent with every call. A downstream build puts what the whole session is scoped to here — the
 * hosted edition's selected organization — because it is ambient: no caller should have to pass it.
 */
export const ambient: Record<string, string> = {}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { accept: 'application/json', ...ambient, ...(init?.json !== undefined && { 'content-type': 'application/json' }), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  if (!response.ok) {
    // The status and the server's reason travel with the error: the auth gate has to tell a 401 (go
    // and log in) from a 403 (there is a session, and it is refused — say why) from the backend
    // being down, where logging in would not help.
    const detail = await response.json().then((body) => body?.error as string | undefined).catch(() => undefined)
    throw Object.assign(new Error(`${init?.method ?? 'GET'} ${path} failed: ${response.status}`), { status: response.status, detail })
  }
  // A handler returning nothing answers 200 with an empty body, not only 204: parsing that would throw.
  const body = await response.text()
  return (body ? JSON.parse(body) : undefined) as T
}
