import { cn } from 'cn'
import { lex } from '@/lib/content'

/** A message as prose: its arguments as chips, so nobody reads braces to see what a string says. */
export function Pattern({ text, rtl, className }: { text: string; rtl?: boolean; className?: string }) {
  if (!text) return <span className="text-muted-foreground italic">empty</span>
  return (
    <span dir={rtl ? 'rtl' : undefined} className={cn('[overflow-wrap:anywhere]', className)}>
      {segments(text).map((segment, i) =>
        segment.argument ? (
          <Chip key={i} name={segment.argument} kind={segment.kind} />
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </span>
  )
}

type Segment = { text: string; argument?: string; kind?: string }

/** The pattern's literal text and its top-level arguments, read off the editor's own lexer. */
function segments(pattern: string): Segment[] {
  const out: Segment[] = []
  let open = 0
  for (const { text, kind } of lex(pattern)) {
    const last = out.at(-1)
    if (kind === 'brace') {
      open += text === '{' ? 1 : -1
      if (open === 1 && text === '{') out.push({ text: '', argument: '' })
    } else if (open === 0) {
      if (last && last.argument === undefined) last.text += text
      else out.push({ text })
    } else if (open === 1 && last?.argument === '' && kind === 'name') {
      last.argument = last.text = text
    } else if (open === 1 && last && kind === 'type' && !last.kind) {
      last.kind = text
    }
  }
  return out
}

/** Inline, in the flow of the sentence: an argument is part of the text, not an annotation on it. */
function Chip({ name, kind }: { name: string; kind?: string }) {
  const branching = kind === 'plural' || kind === 'selectordinal' || kind === 'select'
  return (
    <span className="bg-foreground/[0.07] mx-px inline-flex items-baseline gap-1 rounded-md px-1.5 py-px align-baseline font-mono text-[0.84em] font-medium">
      {name}
      {branching && <span className="font-sans text-[0.8em] opacity-50">{kind === 'select' ? 'select' : 'plural'}</span>}
    </span>
  )
}
