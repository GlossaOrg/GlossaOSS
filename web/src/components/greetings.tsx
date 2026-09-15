import { useEffect, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from 'cn'

/** "Hello" in the languages a project might be translated into. */
const hellos = [
  'Hello', 'Ciao', 'Bonjour', 'Hallo', 'Hola', 'Olá', 'Hej', 'Hei', 'Moi', 'Tere', 'Sveiki', 'Labas', 'Ahoj', 'Cześć',
  'Szia', 'Salut', 'Bok', 'Zdravo', 'Здраво', 'Привіт', 'Привет', 'Сайн уу', 'Γεια σου', 'Merhaba', 'Salam', 'Բարև',
  'გამარჯობა', 'שלום', 'مرحبا', 'سلام', 'नमस्ते', 'হ্যালো', 'வணக்கம்', 'నమస్తే', 'ಹಲೋ', 'ආයුබෝවන්', 'สวัสดี', 'ສະບາຍດີ',
  'ជំរាបសួរ', 'မင်္ဂလာပါ', 'Xin chào', 'Halo', 'Kumusta', 'こんにちは', '안녕하세요', '你好', 'Jambo', 'Sawubona',
  'Sannu', 'Ndewo', 'Salama', 'Dia dhuit', 'Helo', 'Kaixo', 'Bongu', 'Halló', 'Goeiedag', 'Aloha', 'Kia ora', 'Talofa',
]

/** Paper, ink and pencil of each sticky-note colour. */
const tints = [
  { paper: 'bg-[#fff3a0]', ink: 'text-amber-900', pencil: 'text-amber-400' },
  { paper: 'bg-sky-100', ink: 'text-sky-800', pencil: 'text-sky-400' },
  { paper: 'bg-rose-100', ink: 'text-rose-800', pencil: 'text-rose-400' },
  { paper: 'bg-violet-100', ink: 'text-violet-800', pencil: 'text-violet-400' },
  { paper: 'bg-emerald-100', ink: 'text-emerald-800', pencil: 'text-emerald-400' },
]

type Cell = { row: number; col: number; x: number; y: number }
type Grid = { free: Cell[]; cols: number; card: DOMRect; width: number; height: number }
type Note = ReturnType<typeof note>

let noteIds = 0
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]
const between = (min: number, max: number) => min + Math.random() * (max - min)

/** The viewport cut into cells about a note and its trail wide, minus those the card covers. */
function gridOf(card: DOMRect): Grid {
  const cols = Math.max(1, Math.floor(innerWidth / 300))
  const rows = Math.max(1, Math.floor(innerHeight / 230))
  const [w, h] = [innerWidth / cols, innerHeight / rows]
  const free = Array.from({ length: rows * cols }, (_, i) => ({ row: Math.floor(i / cols), col: i % cols }))
    .filter(({ row, col }) => col * w > card.right + 40 || (col + 1) * w < card.left - 40 || row * h > card.bottom + 40 || (row + 1) * h < card.top - 40)
    .map((c) => ({ ...c, x: (c.col + 0.5) * w, y: (c.row + 0.5) * h }))
  return { free, cols, card, width: innerWidth, height: innerHeight }
}

const onLeft = ({ card }: Grid, c: Cell) => c.x < (card.left + card.right) / 2

/**
 * How crowded a note in `c` would be: every other note pushes on it with the inverse square of their
 * distance, and so, more gently, do the nearest viewport edge and the card — each as a note mirrored
 * across it. Unlike the nearest distance alone, every neighbour counts, so the sum tells an even
 * spread from a clump.
 */
function strain({ card, width, height }: Grid, c: Cell, others: Cell[]) {
  const push = (d: number) => 1 / Math.max(d, 1) ** 2
  const toCard = Math.hypot(Math.max(card.left - c.x, 0, c.x - card.right), Math.max(card.top - c.y, 0, c.y - card.bottom))
  // Horizontal distance counts for less: that is where trails run.
  return others.reduce((sum, o) => sum + push(Math.hypot((o.x - c.x) * 0.7, o.y - c.y)), 0) + (push(2 * Math.min(c.x, width - c.x, c.y, height - c.y)) + push(2 * toCard)) / 2
}

const shuffled = <T,>(items: T[]) => items.map((i) => [Math.random(), i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i)

/** The first notes: of many random picks split evenly between the card's sides, the least strained. */
function spread(grid: Grid, count: number) {
  let best: Cell[] = []
  for (let attempt = 0, least = Infinity; attempt < 400; attempt++) {
    const [lefts, rights] = [shuffled(grid.free.filter((c) => onLeft(grid, c))), shuffled(grid.free.filter((c) => !onLeft(grid, c)))]
    const onLeftCount = Math.min(lefts.length, Math.max(count - rights.length, Math.random() < 0.5 ? Math.ceil(count / 2) : Math.floor(count / 2)))
    const cells = [...lefts.slice(0, onLeftCount), ...rights.slice(0, count - onLeftCount)]
    const total = cells.reduce((sum, c) => sum + strain(grid, c, cells.filter((o) => o !== c)), 0)
    if (total < least) [best, least] = [cells, total]
  }
  return best
}

/** Where a note goes next: a cell on the side with fewer notes, nearly the least strained, and not the one a note just left if another is open. */
function next(grid: Grid, taken: Cell[], left: Cell) {
  const open = grid.free.filter((c) => !taken.includes(c) && c !== left)
  const candidates = open.length ? open : grid.free.filter((c) => !taken.includes(c))
  const [lefts, rights] = [taken.filter((c) => onLeft(grid, c)).length, taken.filter((c) => !onLeft(grid, c)).length]
  const lighter = lefts === rights ? candidates : candidates.filter((c) => onLeft(grid, c) === lefts < rights)
  const scored = (lighter.length ? lighter : candidates).map((c) => ({ c, strain: strain(grid, c, taken) }))
  const least = Math.min(...scored.map((s) => s.strain))
  return pick(scored.filter((s) => s.strain <= least * 1.15)).c
}

/** A trail runs toward the card, unless that neighbour holds a note and the other side is free: 1 is rightward, -1 leftward. */
function heading(grid: Grid, cell: Cell, taken: Cell[]) {
  const holds = (col: number) => taken.some((o) => o.row === cell.row && o.col === col)
  const cardward = onLeft(grid, cell) ? 1 : -1
  const away = cell.col - cardward
  return holds(cell.col + cardward) && away >= 0 && away < grid.cols && !holds(away) ? -cardward : cardward
}

/** A smooth curve through `points`: Catmull-Rom, as cubic Béziers. */
function spline(points: number[][]) {
  const p = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]
  const f = (n: number) => n.toFixed(1)
  return points.slice(1).reduce((path, [x, y], i) => {
    const [a, b, c] = [p(i - 1), p(i), p(i + 2)]
    return `${path} C${f(b[0] + (x - a[0]) / 6)} ${f(b[1] + (y - a[1]) / 6)} ${f(x - (c[0] - b[0]) / 6)} ${f(y - (c[1] - b[1]) / 6)} ${f(x)} ${f(y)}`
  }, `M${f(points[0][0])} ${f(points[0][1])}`)
}

function note(cell: Cell, toward: number, shown: { word: string }[], delay = 0) {
  // The trail runs from a point out toward the card to the note's centre, under the paper. On the
  // way it loops the way a pen does: up, back over itself, down across the line, and on.
  const angle = (((toward > 0 ? 0 : 180) + between(-35, 35)) * Math.PI) / 180
  const length = between(170, 220)
  const [ux, uy] = [-Math.cos(angle), -Math.sin(angle)]
  const side = pick([-1, 1])
  const at = (along: number, across: number) => [(along - length) * ux - across * side * uy, (along - length) * uy + across * side * ux]
  const [c, r] = [length * 0.4, between(16, 24)]
  const loop = [[0, 0], [c - 2.2 * r, 0.1 * r], [c + 0.5 * r, 0.9 * r], [c + 0.1 * r, 2.1 * r], [c - r, 1.5 * r], [c - 0.3 * r, 0.2 * r], [c + 2 * r, -0.3 * r], [length * 0.75, 0.2 * r], [length, 0]]
  return {
    id: noteIds++,
    cell,
    word: pick(hellos.filter((w) => !shown.some((n) => n.word === w))),
    tint: pick(tints),
    x: cell.x + between(-20, 20),
    y: cell.y + between(-16, 16),
    tilt: between(-9, 9),
    tape: between(-10, 10),
    // The sparks sit on the top corner away from the trail.
    trailOnRight: toward > 0,
    delay,
    trail: spline(loop.map(([along, across]) => at(along, across))),
    stay: between(6000, 14000),
  }
}

/** Sticky notes around the sign-in: each is drawn in by a dashed pencil trail, stays a while, and gives way to another. */
export function Greetings({ around }: { around: RefObject<HTMLElement | null> }) {
  const [notes, setNotes] = useState<Note[]>([])
  const layout = useRef<Grid>(null!)
  const replace = (i: number) =>
    setNotes((shown) => {
      const others = shown.filter((_, j) => j !== i).map((n) => n.cell)
      const cell = next(layout.current, others, shown[i].cell)
      return shown.map((n, j) => (i === j ? note(cell, heading(layout.current, cell, others), shown) : n))
    })

  useEffect(() => {
    let timer = 0
    const lay = () => {
      const grid = (layout.current = gridOf(around.current!.getBoundingClientRect()))
      const cells = spread(grid, Math.ceil(grid.free.length * 0.4))
      setNotes(cells.reduce<Note[]>((shown, cell, i) => [...shown, note(cell, heading(grid, cell, cells), shown, i * 0.25)], []))
    }
    const relay = () => {
      clearTimeout(timer)
      timer = setTimeout(lay, 250)
    }
    lay()
    addEventListener('resize', relay)
    return () => removeEventListener('resize', relay)
  }, [around])

  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <AnimatePresence>
        {notes.map((n, i) => (
          <Sticky key={n.id} note={n} onExpire={() => replace(i)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function Sticky({ note, onExpire }: { note: Note; onExpire: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onExpire, note.stay)
    return () => clearTimeout(timer)
  }, [note.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const { delay } = note
  const born = delay + 1
  const draw = (at: number, duration = 0.35) => ({ initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { delay: at, duration, ease: 'easeOut' } }) as const

  return (
    <motion.div className={cn('absolute', note.tint.pencil)} style={{ left: note.x, top: note.y }} exit={{ opacity: 0, transition: { duration: 0.6 } }}>
      {/* A dashed stroke cannot animate its own dashes into view, so a solid copy of it, drawn in, is its mask. */}
      <svg className="absolute overflow-visible" width="1" height="1">
        <mask id={`trail-${note.id}`} maskUnits="userSpaceOnUse" x="-600" y="-600" width="1200" height="1200">
          <motion.path d={note.trail} fill="none" stroke="white" strokeWidth="6" {...draw(delay, 1.1)} />
        </mask>
        <path d={note.trail} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="6 7" strokeLinecap="round" mask={`url(#trail-${note.id})`} />
      </svg>

      <motion.div
        className="absolute -translate-1/2 drop-shadow-[0_12px_14px_rgb(0_0_0/0.12)]"
        initial={{ opacity: 0, scale: 0.3, rotate: note.tilt - 25 }}
        animate={{ opacity: 1, scale: 1, rotate: note.tilt }}
        transition={{ delay: born - 0.15, type: 'spring', stiffness: 260, damping: 16 }}
      >
        <div className={cn('grid h-32 w-40 place-content-center justify-items-center gap-1 px-3 [clip-path:polygon(0_0,100%_0,100%_calc(100%-20px),calc(100%-20px)_100%,0_100%)]', note.tint.paper, note.tint.ink)}>
          <span className="text-2xl font-bold tracking-tight whitespace-nowrap">{note.word}</span>
          <svg width="56" height="10" viewBox="0 0 56 10" fill="none" stroke="currentColor" strokeLinecap="round" className="opacity-70">
            <motion.path d="M2 3 C18 1 38 2 54 3" strokeWidth="2" {...draw(born + 0.2)} />
            <motion.path d="M10 8 C22 6 34 7 44 7" strokeWidth="1.5" {...draw(born + 0.4)} />
          </svg>
        </div>
        {/* The folded corner: the clipped-off triangle, in the same paper a shade darker. */}
        <div className={cn('absolute right-0 bottom-0 size-5 brightness-90 [clip-path:polygon(0_0,100%_0,0_100%)]', note.tint.paper)} />
        {/* Washi tape, torn at both ends. */}
        <div
          className="absolute -top-3 left-1/2 h-6 w-18 -translate-x-1/2 bg-current/30 backdrop-blur-[1px] [clip-path:polygon(0_8%,5%_0,95%_6%,100%_0,97%_50%,100%_100%,5%_94%,0_100%,3%_50%)]"
          style={{ rotate: `${note.tape}deg` }}
        />
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={cn('absolute -top-6', note.tint.pencil, note.trailOnRight ? '-left-6' : '-right-6 -scale-x-100')}
        >
          <motion.path d="M3 13 L9 15" {...draw(born + 0.3, 0.15)} />
          <motion.path d="M7 5 L11 11" {...draw(born + 0.4, 0.15)} />
          <motion.path d="M15 2 L15.5 9" {...draw(born + 0.5, 0.15)} />
        </svg>
      </motion.div>
    </motion.div>
  )
}
