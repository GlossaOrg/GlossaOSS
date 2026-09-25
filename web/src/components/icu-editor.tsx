import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckIcon, Columns2Icon, CopyIcon, LayoutTemplateIcon, PlusIcon, Redo2Icon, SearchIcon, SparklesIcon, SquareIcon, Undo2Icon } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/kit'
import { Language, tint } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAi } from '@/lib/ai'
import { counting, lex, type Contract, type Kind, type Locale } from '@/lib/content'
import { library } from '@/lib/templates'

/**
 * Syntax in ink, and what a message fills in on the pastel of the language it is written in: the
 * caller sets `--hl` (see `ink`) on whatever holds a `Highlight`.
 */
const tone: Record<Exclude<Kind, 'brace'>, string> = {
  text: '',
  comma: 'text-muted-foreground/60',
  quote: 'text-muted-foreground/60',
  name: 'text-on-tint rounded-[4px] bg-(--hl) font-semibold',
  type: 'text-muted-foreground',
  style: 'text-muted-foreground',
  arm: 'font-semibold',
  hash: 'text-on-tint rounded-[4px] bg-(--hl) font-semibold',
}

/** Where a `Highlight` is shown: `--hl` for its arguments, the pastel of `locale`, or a light wash over one. */
export const ink = (locale?: string) => ({ '--hl': locale ? tint(locale) : 'rgb(255 255 255 / 0.7)' }) as React.CSSProperties

/** Matching braces alternate between two weights of ink, so the eye pairs them without counting. */
const braces = ['text-foreground font-semibold', 'text-muted-foreground font-semibold']

/** The pattern as coloured spans; `error` marks the character the server pointed at, if it did. */
export function Highlight({ source, error }: { source: string; error?: number }) {
  const tokens = lex(source)
  const starts: number[] = []
  tokens.forEach((_, i) => starts.push(i ? starts[i - 1] + tokens[i - 1].text.length : 0))
  return (
    <>
      {tokens.flatMap((token, i) => {
        const at = starts[i]
        const end = at + token.text.length
        const className = token.kind === 'brace' ? braces[token.depth % braces.length] : tone[token.kind]
        if (error === undefined || error < at || error >= end) return [<span key={i} className={className}>{token.text}</span>]
        const cut = error - at
        return [
          <span key={`${i}a`} className={className}>{token.text.slice(0, cut)}</span>,
          <span key={`${i}b`} className={cn(className, 'decoration-destructive underline decoration-wavy underline-offset-4')}>{token.text[cut]}</span>,
          <span key={`${i}c`} className={className}>{token.text.slice(cut + 1)}</span>,
        ]
      })}
    </>
  )
}

/** The arms a plural needs in this locale, in counting order, so an inserted one is complete from the start. */
const arms = (forms: Record<string, string[]>) => counting({ ...forms, other: [] })

type Snippet = { label: string; hint: string; text: string; select?: string }

function snippets(locale: Locale): { title: string; items: Snippet[] }[] {
  const block = (name: string, kind: string, lines: string[]) => `{${name}, ${kind},\n${lines.map((line) => `  ${line}`).join('\n')}\n}`
  return [
    {
      title: 'Structure',
      items: [
        { label: 'Plural', hint: arms(locale.cardinal).join(' '), text: block('count', 'plural', arms(locale.cardinal).map((form) => `${form} {#}`)), select: 'count' },
        { label: 'Select', hint: 'one per value', text: block('choice', 'select', ['first {}', 'second {}', 'other {}']), select: 'choice' },
        { label: 'Ordinal', hint: arms(locale.ordinal).join(' '), text: block('place', 'selectordinal', arms(locale.ordinal).map((form) => `${form} {#}`)), select: 'place' },
        { label: 'Number sign', hint: '#', text: '#' },
      ],
    },
    {
      title: 'Formats',
      items: [
        { label: 'Number', hint: '1,234', text: '{amount, number}', select: 'amount' },
        { label: 'Currency', hint: '€12.50', text: '{amount, number, ::currency/EUR}', select: 'amount' },
        { label: 'Percent', hint: '75%', text: '{ratio, number, ::percent}', select: 'ratio' },
        { label: 'Date', hint: 'Sep 21', text: '{date, date, ::yMMMd}', select: 'date' },
        { label: 'Time', hint: '14:30', text: '{time, time, ::Hm}', select: 'time' },
      ],
    },
  ]
}

/**
 * §6's editor: ICU written by hand, but never blind. It is coloured as it is typed, the server
 * checks it as it is typed, and anything with syntax to it can be inserted or started from a
 * template rather than remembered.
 */
export function IcuEditor({ role, value, onChange, locale, variables, problem, missing, checking, error, templates, reference, suggest }: {
  role: 'Source' | 'Translation'
  value: string
  onChange: (value: string) => void
  locale: Locale
  /** A translation's fixed contract, offered as-is; the source declares its own by writing them. */
  variables?: Contract
  problem: string | null
  missing: string[]
  checking: boolean
  error?: number
  /** Only while a message is first written: an existing one is edited, not restarted. */
  templates?: boolean
  /** A translation's source, laid beside it rather than above, so the two read line against line. */
  reference?: { locale: Locale; pattern: string }
  /** §9: asks for a suggestion, or null once it has reported why it could not. Absent on a source. */
  suggest?: () => Promise<string | null>
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  // The menu keeps focus until it has fully closed, so an insertion waits for that moment.
  const queued = useRef<(() => void) | null>(null)
  const [open, setOpen] = useState(true)
  const pane = templates || reference
  const [copied, setCopied] = useState(false)
  const [writing, setWriting] = useState(false)
  const [landed, setLanded] = useState(false)
  const ai = useAi().data?.available
  // Escape then Tab leaves the field, the way code editors do, so the keyboard is never trapped here.
  const escaped = useRef(false)

  /** Through the browser's own editing, so every insertion is one step of the native undo. */
  function write(text: string, select?: string, replaceAll = false) {
    const el = field.current!
    el.focus()
    if (replaceAll) el.select()
    const start = el.selectionStart
    document.execCommand('insertText', false, text)
    const at = select ? text.indexOf(select) : -1
    if (at >= 0) el.setSelectionRange(start + at, start + at + select!.length)
  }

  const run = (command: 'undo' | 'redo') => {
    field.current?.focus()
    document.execCommand(command)
  }

  /** Tab indents and Shift+Tab outdents, whole lines when a selection spans several, each one undo step. */
  function indent(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      escaped.current = true
      return
    }
    if (e.key !== 'Tab' || escaped.current || e.altKey || e.ctrlKey || e.metaKey) {
      escaped.current = false
      return
    }
    e.preventDefault()
    const el = e.currentTarget
    const { selectionStart: from, selectionEnd: to, value: text } = el
    if (!e.shiftKey && !text.slice(from, to).includes('\n')) {
      document.execCommand('insertText', false, '  ')
      return
    }
    const start = text.lastIndexOf('\n', from - 1) + 1
    const stop = to > from && text[to - 1] === '\n' ? to - 1 : text.indexOf('\n', to) < 0 ? text.length : text.indexOf('\n', to)
    const block = text.slice(start, stop)
    const next = block.split('\n').map((line) => (e.shiftKey ? line.replace(/^ {1,2}/, '') : `  ${line}`)).join('\n')
    if (next === block) return
    el.setSelectionRange(start, stop)
    document.execCommand('insertText', false, next)
    if (from === to) el.setSelectionRange(Math.max(start, from - (block.length - next.length)), Math.max(start, from - (block.length - next.length)))
    else el.setSelectionRange(start, start + next.length)
  }

  async function ask() {
    setWriting(true)
    const pattern = await suggest!()
    setWriting(false)
    if (!pattern) return
    // Through write(), so one Ctrl-Z takes the whole suggestion back out again.
    write(pattern, undefined, true)
    setLanded(true)
    setTimeout(() => setLanded(false), 900)
  }

  const blank = !value.trim()

  return (
    // The side column is always mounted and its width animates, so closing it never leaves it hanging
    // under the editor for a frame the way an unmounting pane did.
    <div
      className={cn(
        'grid gap-3 lg:gap-0 lg:transition-[grid-template-columns] lg:duration-300 lg:ease-[cubic-bezier(0.2,0,0,1)]',
        pane && (reference ? (open ? 'lg:grid-cols-[1fr_1fr]' : 'lg:grid-cols-[0fr_1fr]') : open ? 'lg:grid-cols-[27rem_1fr]' : 'lg:grid-cols-[0rem_1fr]'),
      )}
    >
      {pane && (
        <div inert={!open} className={cn('flex min-w-0 overflow-hidden transition-opacity duration-200 lg:pr-3', open ? 'opacity-100' : 'opacity-0 max-lg:hidden')}>
          {reference ? <Reference locale={reference.locale} pattern={reference.pattern} /> : <Templates locale={locale.locale} onPick={(pattern) => write(pattern, undefined, true)} />}
        </div>
      )}

      <section className="bg-background flex min-w-0 flex-col overflow-hidden rounded-[28px] border">
        <header className="flex min-h-14 flex-wrap items-center gap-1 border-b px-4 py-2">
          {/* Beside a source, the pane being written in needs no label: it is the other one. */}
          <Pane role={reference ? undefined : role} locale={locale.locale} />
          <span className="ml-auto" />
          {suggest && (
            <Button
              variant="outline"
              size="sm"
              disabled={!ai || writing}
              title={ai ? undefined : 'AI features are off.'}
              onClick={ask}
            >
              <SparklesIcon className="transition-transform duration-300 motion-safe:group-hover/button:scale-110" />
              Suggest
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Undo" onClick={() => run('undo')}>
            <Undo2Icon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Redo" onClick={() => run('redo')}>
            <Redo2Icon />
          </Button>
          <DropdownMenu
            onOpenChangeComplete={(open) => {
              if (!open) queued.current?.()
              queued.current = null
            }}
          >
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
              <PlusIcon className="transition-transform duration-300 motion-safe:group-hover/button:rotate-90" />
              Insert
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60" finalFocus={false}>
              {variables && Object.keys(variables).length > 0 && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Variables</DropdownMenuLabel>
                    {Object.entries(variables).map(([name, variable]) => (
                      <DropdownMenuItem key={name} onClick={() => (queued.current = () => write(`{${name}}`))}>
                        <span className="font-mono text-[13px]">{name}</span>
                        <DropdownMenuShortcut>{variable.type.toLowerCase()}</DropdownMenuShortcut>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}
              {!variables && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => (queued.current = () => write('{name}', 'name'))}>
                      <span className="font-mono text-[13px]">{'{variable}'}</span>
                      <DropdownMenuShortcut>text</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}
              {snippets(locale).map((group, i) => (
                <DropdownMenuGroup key={group.title}>
                  {i > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>{group.title}</DropdownMenuLabel>
                  {group.items.map((item) => (
                    <DropdownMenuItem key={item.label} onClick={() => (queued.current = () => write(item.text, item.select))}>
                      {item.label}
                      <DropdownMenuShortcut className="max-w-28 truncate font-mono">{item.hint}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy"
            onClick={() => {
              navigator.clipboard?.writeText(value)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
          >
            {copied ? <CheckIcon className="text-emerald-600" /> : <CopyIcon />}
          </Button>
          {pane && (
            <>
              <Tabs value={open ? 'split' : 'single'} onValueChange={(view) => setOpen(view === 'split')}>
                <TabsList>
                  <TabsTrigger value="split" aria-label={reference ? 'Side by side' : 'Show templates'} title={reference ? 'Side by side' : 'Show templates'} className="px-2">
                    {reference ? <Columns2Icon /> : <LayoutTemplateIcon />}
                  </TabsTrigger>
                  <TabsTrigger value="single" aria-label={reference ? 'Translation only' : 'Editor only'} title={reference ? 'Translation only' : 'Editor only'} className="px-2">
                    <SquareIcon />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          )}
        </header>

        {/* The textarea does the editing and stays transparent; the coloured copy beneath it sets
            the height, so the two can never scroll apart. Both must wrap identically. */}
        <div
          className={cn(
            'relative min-h-48 flex-1 font-mono text-[14.5px] leading-[1.8] transition-shadow duration-500',
            landed && 'ring-foreground/30 ring-2 ring-inset',
          )}
        >
          <AnimatePresence>
            {writing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-background/30 absolute inset-0 z-10 grid place-items-center backdrop-blur-[3px]"
              >
                <motion.p
                  initial={{ y: 8, scale: 0.96 }}
                  animate={{ y: 0, scale: 1 }}
                  exit={{ y: -4 }}
                  transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
                  className="flex items-center gap-2 font-sans text-sm font-medium"
                >
                  <SparklesIcon className="size-4 motion-safe:animate-[float_1.8s_ease-in-out_infinite]" />
                  <span className="bg-[linear-gradient(110deg,var(--muted-foreground)_35%,var(--foreground)_50%,var(--muted-foreground)_65%)] bg-[length:200%_100%] bg-clip-text text-transparent motion-safe:animate-[sheen_1.6s_linear_infinite]">
                    Writing a suggestion
                  </span>
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
          <pre aria-hidden dir={locale.rtl ? 'rtl' : undefined} style={ink(locale.locale)} className="m-0 p-5 break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
            <Highlight source={value} error={error} />
            {'\n'}
          </pre>
          <textarea
            ref={field}
            value={value}
            dir={locale.rtl ? 'rtl' : undefined}
            spellCheck={false}
            placeholder={templates ? 'Write a message, or start from a template' : reference ? 'Write the translation' : 'Write the message'}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={indent}
            className="caret-foreground selection:bg-foreground/15 placeholder:text-muted-foreground/60 absolute inset-0 resize-none overflow-hidden bg-transparent p-5 break-words whitespace-pre-wrap text-transparent outline-none [overflow-wrap:anywhere]"
          />
        </div>

        <footer className={cn('flex items-start gap-2.5 border-t px-5 py-3 text-sm', problem && !blank ? 'bg-destructive/6 text-destructive' : 'text-muted-foreground')}>
          <span className={cn('mt-2 size-1.5 shrink-0 rounded-full', blank ? 'bg-muted-foreground/40' : problem ? 'bg-destructive' : missing.length ? 'bg-amber-500' : 'bg-emerald-500', checking && 'motion-safe:animate-pulse')} />
          <span className="min-w-0">
            {problem ??
              (missing.length
                ? `Saves fine. ${locale.locale} also needs ${missing.join(', ')} before the catalog publishes.`
                : 'Every form this locale needs is here. Ready to publish.')}
          </span>
        </footer>
      </section>
    </div>
  )
}

/** Which language a pane holds, said with its colour and its name rather than in small grey capitals. */
function Pane({ role, locale }: { role?: string; locale: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[15px]">
      <Language locale={locale} tag={!!role} className="font-semibold" />
      {role && <Badge className="bg-foreground/[0.07]">{role}</Badge>}
    </span>
  )
}

/** The source beside its translation, on its own pastel: read-only, set in the same type so lines can be compared. */
function Reference({ locale, pattern }: { locale: Locale; pattern: string }) {
  return (
    <section className="text-on-tint flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px]" style={{ background: tint(locale.locale) }}>
      <header className="flex h-14 items-center border-b border-black/8 px-5">
        <Pane role="Source" locale={locale.locale} />
      </header>
      <pre dir={locale.rtl ? 'rtl' : undefined} style={ink()} className="m-0 flex-1 p-5 font-mono text-[14.5px] leading-[1.8] break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
        <Highlight source={pattern} />
      </pre>
    </section>
  )
}

/** Categories down the side, their templates beside them; a search looks through all of them at once. */
function Templates({ onPick, locale }: { onPick: (pattern: string) => void; locale: string }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(library[0].name)
  const needle = query.trim().toLowerCase()
  const all = library.flatMap((group) => group.templates.map((template) => ({ ...template, group: group.name })))
  const shown = needle
    ? all.filter((template) => `${template.name} ${template.description} ${template.group} ${template.pattern}`.toLowerCase().includes(needle))
    : all.filter((template) => template.group === category)

  return (
    <aside style={ink(locale)} className="bg-background flex h-[38rem] min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] border">
      <label className="relative border-b p-3">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-7 size-4 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${all.length} templates`}
          className="bg-secondary focus:bg-background focus:ring-ring/25 h-10 w-full rounded-full pr-3 pl-11 text-sm outline-none focus:ring-2"
        />
      </label>
      <div className="grid min-h-0 flex-1 grid-cols-[9.5rem_minmax(0,1fr)]">
        <nav className="grid content-start gap-0.5 overflow-y-auto border-r p-2">
          {library.map((group) => {
            const active = !needle && group.name === category
            return (
              <button
                key={group.name}
                type="button"
                onClick={() => {
                  setCategory(group.name)
                  setQuery('')
                }}
                className={cn(
                  'link-bg-animated flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-left text-[13.5px]',
                  active ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:bg-secondary hover:text-foreground font-medium',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{group.name}</span>
                <span className="text-[10px] opacity-50">{group.templates.length}</span>
              </button>
            )
          })}
        </nav>
        <ul className="grid content-start gap-2 overflow-y-auto p-3">
          {shown.map((template) => (
            <li key={`${template.group}/${template.name}`}>
              <button
                type="button"
                onClick={() => onPick(template.pattern)}
                className="hover:bg-secondary grid w-full cursor-pointer gap-1 rounded-2xl border p-3.5 text-left transition-[background-color,transform] duration-200 motion-safe:hover:-translate-y-px"
              >
                <span className="truncate text-[15px] font-semibold">{template.name}</span>
                <span className="text-muted-foreground text-xs">{needle ? `${template.group} · ${template.description}` : template.description}</span>
                <code className="mt-1 line-clamp-2 font-mono text-xs leading-relaxed">
                  <Highlight source={template.pattern.replace(/\n\s*/g, ' ')} />
                </code>
              </button>
            </li>
          ))}
          {!shown.length && <li className="text-muted-foreground p-2 text-sm">No template matches.</li>}
        </ul>
      </div>
    </aside>
  )
}
