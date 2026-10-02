/** The first visible, chromatic fill in a flag SVG. */
export function flagColor(svg: string) {
  for (const [, value] of svg.matchAll(/\bfill=["'](#[\da-f]{6})["']/gi)) {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16))
    if (Math.max(r, g, b) - Math.min(r, g, b) >= 48) return value.toLowerCase()
  }
}
