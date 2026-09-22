import { cn } from 'cn'
import { segments, typeTint, type VariableType } from '@/lib/content'

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

/** Inline, in the flow of the sentence: an argument is part of the text, not an annotation on it. */
/** The same rule the server infers with, for colour only. */
const tint: Record<string, VariableType> = { plural: 'NUMBER', selectordinal: 'NUMBER', number: 'NUMBER', date: 'TEMPORAL', time: 'TEMPORAL', select: 'SELECT' }

function Chip({ name, kind }: { name: string; kind?: string }) {
  const branching = kind === 'plural' || kind === 'selectordinal' || kind === 'select'
  return (
    <span className={cn('mx-px inline-flex items-baseline gap-1 rounded-md px-1.5 py-px align-baseline text-[0.9em] font-medium', typeTint[tint[kind ?? ''] ?? 'TEXT'])}>
      {name}
      {branching && <span className="text-[0.75em] opacity-60">{kind === 'select' ? 'select' : 'plural'}</span>}
    </span>
  )
}
