/**
 * A localization file as key → message, in the formats teams arrive with: JSON (flat, nested or
 * i18next's), Java `.properties` and iOS `.strings`. Nested JSON keys join with dots.
 * ponytail: values are taken as they are; i18next's `_one`/`_other` siblings stay separate keys
 * instead of becoming one ICU plural. Convert them when a team imports plurals that way.
 */
export function parse(name: string, text: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (/\.properties$/i.test(name)) {
    const lines = text.replace(/\\\r?\n\s*/g, '').split(/\r?\n/)
    for (const line of lines) {
      if (/^\s*([#!]|$)/.test(line)) continue
      const at = /^\s*((?:\\.|[^=:\s])+)\s*[=:\s]\s*(.*)$/.exec(line)
      if (at) out[unescape(at[1])] = unescape(at[2])
    }
    return out
  }
  if (/\.strings$/i.test(name)) {
    for (const [, key, value] of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g)) out[unescape(key)] = unescape(value)
    return out
  }
  const walk = (value: unknown, prefix: string) => {
    if (typeof value === 'string') out[prefix] = value
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, prefix ? `${prefix}.${k}` : k)
  }
  walk(JSON.parse(text), '')
  return out
}

const unescape = (s: string) =>
  s.replace(/\\u([0-9a-fA-F]{4})|\\(.)/g, (_, hex: string | undefined, c: string) => (hex ? String.fromCharCode(parseInt(hex, 16)) : ({ n: '\n', t: '\t', r: '\r' } as Record<string, string>)[c] ?? c))
