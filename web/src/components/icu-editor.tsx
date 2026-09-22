import { useRef, useState } from 'react'
import { CheckIcon, Columns2Icon, CopyIcon, LayoutTemplateIcon, PlusIcon, Redo2Icon, SearchIcon, SquareIcon, Undo2Icon } from 'lucide-react'
import { cn } from 'cn'
import { Language } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { counting, lex, typeTint, type Contract, type Kind, type Locale } from '@/lib/content'
import { library } from '@/lib/templates'

const tone: Record<Exclude<Kind, 'brace'>, string> = {
  text: '',
  comma: 'text-muted-foreground/60',
  quote: 'text-slate-400 dark:text-slate-500',
  name: 'rounded-[3px] bg-sky-100/80 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200',
  type: 'text-violet-600 dark:text-violet-300',
  style: 'text-rose-600 dark:text-rose-300',
  arm: 'text-emerald-700 dark:text-emerald-300',
  hash: 'rounded-[3px] bg-amber-100/80 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200',
}

/** Matching braces share a colour, so the eye pairs them without counting. */
const braces = ['text-brand', 'text-violet-500', 'text-sky-500', 'text-amber-500', 'text-rose-500']

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
export function IcuEditor({ role, value, onChange, locale, variables, problem, missing, checking, error, templates, reference }: {
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
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  // The menu keeps focus until it has fully closed, so an insertion waits for that moment.
  const queued = useRef<(() => void) | null>(null)
  const [open, setOpen] = useState(true)
  const pane = templates || reference
  const [copied, setCopied] = useState(false)
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

  const blank = !value.trim()
  const status = blank ? null : checking ? 'Checking' : problem ? 'Error' : 'Valid'

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
          {reference ? <Reference locale={reference.locale} pattern={reference.pattern} /> : <Templates onPick={(pattern) => write(pattern, undefined, true)} />}
        </div>
      )}

      <section className="bg-background flex min-w-0 flex-col overflow-hidden rounded-xl border">
        <header className="flex h-12 items-center gap-2 border-b px-3">
          <Pane role={role} locale={locale.locale} />
          <span
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
              !status && 'invisible',
              status === 'Error' ? 'bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200',
            )}
          >
            <span className={cn('size-1.5 rounded-full bg-current', status === 'Checking' && 'motion-safe:animate-pulse')} />
            {status}
          </span>
          <span className="bg-border mx-1 h-4 w-px" />
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
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="text-brand" />}>
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
                        <DropdownMenuShortcut>
                          <span className={cn('rounded px-1 text-[10px]', typeTint[variable.type])}>{variable.type.toLowerCase()}</span>
                        </DropdownMenuShortcut>
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
              <span className="bg-border mx-1 h-4 w-px" />
              <Tabs value={open ? 'split' : 'single'} onValueChange={(view) => setOpen(view === 'split')}>
                <TabsList className="h-7">
                  <TabsTrigger value="split" aria-label={reference ? 'Side by side' : 'Show templates'} title={reference ? 'Side by side' : 'Show templates'} className="px-1.5">
                    {reference ? <Columns2Icon /> : <LayoutTemplateIcon />}
                  </TabsTrigger>
                  <TabsTrigger value="single" aria-label={reference ? 'Translation only' : 'Editor only'} title={reference ? 'Translation only' : 'Editor only'} className="px-1.5">
                    <SquareIcon />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          )}
        </header>

        {/* The textarea does the editing and stays transparent; the coloured copy beneath it sets
            the height, so the two can never scroll apart. Both must wrap identically. */}
        <div className="relative min-h-44 flex-1 font-mono text-[13.5px] leading-[1.75]">
          <pre aria-hidden dir={locale.rtl ? 'rtl' : undefined} className="m-0 p-4 break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
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
            className="caret-foreground selection:bg-brand/20 placeholder:text-muted-foreground/60 absolute inset-0 resize-none overflow-hidden bg-transparent p-4 break-words whitespace-pre-wrap text-transparent outline-none [overflow-wrap:anywhere]"
          />
        </div>

        <footer className={cn('flex items-start gap-2 border-t px-4 py-2 text-sm', problem && !blank ? 'bg-rose-50/60 text-rose-700 dark:bg-rose-400/5 dark:text-rose-300' : 'text-muted-foreground')}>
          <span className={cn('mt-2 size-1.5 shrink-0 rounded-full', blank ? 'bg-muted-foreground/40' : problem ? 'bg-destructive' : missing.length ? 'bg-amber-500' : 'bg-emerald-500')} />
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

/** Categories down the side, their templates beside them; a search looks through all of them at once. */
/** Which language a pane holds, said with its flag and its name rather than in small grey capitals. */
function Pane({ role, locale }: { role: string; locale: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm">
      <Language locale={locale} />
      <span className="bg-muted text-muted-foreground rounded-full px-2 py-px text-[11px] font-medium">{role}</span>
    </span>
  )
}

/** The source beside its translation: read-only, set in the same type so lines can be compared. */
function Reference({ locale, pattern }: { locale: Locale; pattern: string }) {
  return (
    <section className="bg-secondary/60 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
      <header className="flex h-12 items-center border-b px-4">
        <Pane role="Source" locale={locale.locale} />
      </header>
      <pre dir={locale.rtl ? 'rtl' : undefined} className="m-0 flex-1 p-4 font-mono text-[13.5px] leading-[1.75] break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
        <Highlight source={pattern} />
      </pre>
    </section>
  )
}

function Templates({ onPick }: { onPick: (pattern: string) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(library[0].name)
  const needle = query.trim().toLowerCase()
  const all = library.flatMap((group) => group.templates.map((template) => ({ ...template, icon: group.icon, group: group.name })))
  const shown = needle
    ? all.filter((template) => `${template.name} ${template.description} ${template.group} ${template.pattern}`.toLowerCase().includes(needle))
    : all.filter((template) => template.group === category)

  return (
    <aside className="bg-background flex h-[36rem] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
      <label className="relative border-b p-2.5">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-5 size-3.5 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${all.length} templates`}
          className="bg-muted/50 focus:bg-background focus:ring-ring/40 h-8 w-full rounded-lg pr-2 pl-8 text-sm outline-none focus:ring-2"
        />
      </label>
      <div className="grid min-h-0 flex-1 grid-cols-[9.5rem_minmax(0,1fr)]">
        <nav className="grid content-start gap-px overflow-y-auto border-r p-1.5">
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
                  'link-bg-animated flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]',
                  active ? 'bg-brand/10 text-brand font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <group.icon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{group.name}</span>
                <span className="text-[10px] opacity-50">{group.templates.length}</span>
              </button>
            )
          })}
        </nav>
        <ul className="grid content-start gap-1.5 overflow-y-auto p-2">
          {shown.map((template) => (
            <li key={`${template.group}/${template.name}`}>
              <button
                type="button"
                onClick={() => onPick(template.pattern)}
                className="hover:border-brand/40 hover:bg-brand/5 grid w-full cursor-pointer gap-1 rounded-lg border p-2.5 text-left transition-[background-color,border-color,transform] duration-200 motion-safe:hover:-translate-y-px"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <template.icon className="text-brand size-3.5 shrink-0" />
                  <span className="truncate">{template.name}</span>
                </span>
                <span className="text-muted-foreground text-xs">{needle ? `${template.group} · ${template.description}` : template.description}</span>
                <code className="line-clamp-2 font-mono text-[11px] leading-relaxed">
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
