import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dot, Monogram, languageName, tint } from '@/components/locale'
import { Pattern } from '@/components/pattern'
import { Skeleton } from '@/components/ui/skeleton'
import { covers, useProject, type Project } from '@/lib/projects'
import { state, states, status, useLocale, useLocaleLists, useResources, type Locale, type Resource, type Status } from '@/lib/content'

/** Height-and-fade, the same disclosure the rest of the app uses. */
const unfold = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease: [0.2, 0, 0, 1] },
} as const

/** §5's board: every resource, and what it looks like in one locale. */
export function Content() {
  const { project } = useProject()
  // A deep link can land here before a project is selected, or with none to select.
  if (!project) return <Blank title="No project yet." text="An admin creates one first." />
  return <Board project={project} />
}

function Board({ project }: { project: Project }) {
  const { rows: locales, locale, source, locales: query, select } = useLocale(project.id)
  const lists = useLocaleLists(project.id, locales)
  const resources = useResources(project.id, locale?.locale)
  const [group, setGroup] = useState<string | null>(null)
  const [filter, setFilter] = useState<Status | null>(null)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const manager = covers(project.role, 'MANAGER')

  // Archived resources are out of every catalog, so they are out of the counts too.
  const all = useMemo(() => (resources.data ?? []).filter((r) => !r.archived), [resources.data])
  const groups = useMemo(() => {
    const counts = new Map<string, { total: number; done: number }>()
    for (const r of all) {
      const name = r.key.includes('.') ? r.key.slice(0, r.key.indexOf('.')) : 'ungrouped'
      const row = counts.get(name) ?? { total: 0, done: 0 }
      counts.set(name, { total: row.total + 1, done: row.done + (status(r) === 'approved' ? 1 : 0) })
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [all])

  // The source first, then by name; a locale the caller may not read is not offered at all.
  const ordered = [...locales]
    .sort((a, b) => Number(b.source) - Number(a.source) || languageName(a.locale).localeCompare(languageName(b.locale)))
    .filter((l) => !lists[locales.indexOf(l)]?.error)

  const shown = all.filter((r) => {
    if (group && !(group === 'ungrouped' ? !r.key.includes('.') : r.key.startsWith(`${group}.`))) return false
    if (filter && status(r) !== filter) return false
    if (search && !`${r.key} ${r.sourcePayload.pattern} ${r.payload?.pattern ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (query.error) return <Blank title="This project could not be loaded." text="Reload the page." />
  if (!query.data) return null
  if (!source) {
    return (
      <Blank title={`${project.name} has no languages yet.`} text="A project needs the language it is written in before anything can be.">
        {manager && <Button size="lg" onClick={() => navigate('/locales')}>Pick the source language →</Button>}
      </Blank>
    )
  }

  return (
    <div className="page">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h2>Content</h2>
          <p className="text-muted-foreground mt-4 max-w-[46ch] text-lg">
            {locale?.source ? `Every message in ${project.name}, as it is written.` : `Every message in ${project.name}, and how far ${languageName(locale!.locale)} has got.`}
          </p>
        </div>
        {manager && (
          <Button size="lg" onClick={() => navigate('/content/new')}>
            <PlusIcon className="transition-transform duration-300 motion-safe:group-hover/button:rotate-90" />
            New message
          </Button>
        )}
      </header>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {ordered.map((l) => (
          <LocalePill key={l.locale} locale={l} rows={lists[locales.indexOf(l)].data} active={locale?.locale === l.locale} onSelect={() => select(l.locale)} />
        ))}
      </div>

      <div className="border-foreground mt-8 grid gap-x-12 gap-y-6 border-t pt-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="flex content-start gap-1 overflow-x-auto [scrollbar-width:none] lg:grid">
          <Group label="All messages" count={all.length} active={!group} onClick={() => setGroup(null)} />
          {groups.map(([name, { total, done }]) => (
            <Group key={name} label={name} count={total} done={done} active={group === name} onClick={() => setGroup(name)} />
          ))}
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a message" aria-label="Find a message" className="h-10 w-56 rounded-full pl-10" />
            </label>
            {states.map((s) => {
              const count = all.filter((r) => status(r) === s.value).length
              if (!count && filter !== s.value) return null
              const on = filter === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(on ? null : s.value)}
                  className={cn(
                    'focus-visible:ring-ring/25 inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3',
                    on ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent',
                  )}
                >
                  <span aria-hidden className={cn('size-1.5 rounded-full', s.dot)} />
                  {s.label}
                  <span className="opacity-55">{count}</span>
                </button>
              )
            })}
          </div>

          {resources.error ? (
            <p role="alert" className="text-destructive py-6">Could not load the content. Reload the page.</p>
          ) : !resources.data ? (
            <div className="grid gap-3 py-2" aria-busy>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="grid gap-2 py-3" style={{ opacity: 1 - i * 0.22 }}>
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-6 w-full max-w-lg" />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12">
              <p className="font-heading text-2xl font-bold tracking-[-0.03em]">{all.length ? 'Nothing matches.' : 'No messages yet.'}</p>
              <p className="text-muted-foreground mt-1">
                {all.length ? 'Clear the search or the filter to see the rest.' : manager ? 'Write the first one and the translators can start.' : 'A manager writes the first one.'}
              </p>
            </motion.div>
          ) : (
            <ul>
              <AnimatePresence initial={false}>
                {shown.map((r) => (
                  <motion.li key={r.id} layout="position" {...unfold} className="overflow-hidden">
                    <Row resource={r} locale={locale!} onOpen={() => navigate(`/content/${r.id}`)} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/** A locale to switch to: on its own pastel when it is the one being looked at. */
function LocalePill({ locale, rows, active, onSelect }: { locale: Locale; rows?: Resource[]; active: boolean; onSelect: () => void }) {
  const done = rows?.filter((r) => status(r) === 'approved').length ?? 0
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'focus-visible:ring-ring/25 flex h-14 shrink-0 cursor-pointer items-center gap-3 rounded-full pr-5 pl-2 text-left transition-colors outline-none focus-visible:ring-3',
        active ? 'text-on-tint' : 'bg-secondary hover:bg-accent',
      )}
      style={active ? { background: tint(locale.locale) } : undefined}
    >
      <Monogram locale={locale.locale} className={cn('size-10 rounded-full text-xs', active && 'bg-white!')} />
      <span className="grid leading-tight">
        <span className="text-[15px] font-semibold">{languageName(locale.locale)}</span>
        <span className={cn('text-[12.5px]', active ? 'opacity-65' : 'text-muted-foreground')}>
          {locale.source ? 'Source' : rows ? `${rows.length ? Math.floor((done / rows.length) * 100) : 0}% approved` : 'Counting…'}
        </span>
      </span>
    </button>
  )
}

function Row({ resource, locale, onOpen }: { resource: Resource; locale: Locale; onOpen: () => void }) {
  const s = state(status(resource))
  const dot = resource.key.lastIndexOf('.')

  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:bg-secondary focus-visible:ring-ring/25 -mx-4 grid w-[calc(100%+2rem)] cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 rounded-2xl px-4 py-4 text-left transition-colors outline-none focus-visible:ring-3"
    >
      <span className="min-w-0">
        <span className="text-muted-foreground block truncate font-mono text-[12.5px]">
          {dot > 0 && resource.key.slice(0, dot + 1)}
          <span className="text-foreground font-semibold">{resource.key.slice(dot + 1)}</span>
        </span>
        <span className="mt-1.5 block text-[17px] leading-snug">
          <Pattern text={resource.sourcePayload.pattern} />
        </span>
        {!locale.source && resource.payload && (
          <span className="text-muted-foreground mt-1.5 flex items-baseline gap-2.5 text-[17px] leading-snug">
            <Dot locale={locale.locale} className="translate-y-[-2px]" />
            <Pattern text={resource.payload.pattern} rtl={locale.rtl} />
          </span>
        )}
      </span>
      <Badge dot={s.dot} className="mt-0.5">{s.label}</Badge>
    </button>
  )
}

function Group({ label, count, done, active, onClick }: { label: string; count: number; done?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'link-bg-animated flex h-10 shrink-0 cursor-pointer items-center justify-between gap-3 rounded-full px-4 text-left text-[14.5px]',
        active ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:bg-secondary hover:text-foreground font-medium',
      )}
    >
      <span className="truncate">{label}</span>
      <span className="text-xs tabular-nums opacity-60">{done === undefined ? count : `${done}/${count}`}</span>
    </button>
  )
}

function Blank({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <section className="page">
      <p className="font-heading max-w-[19ch] text-[clamp(2.25rem,4.6vw,4.25rem)] leading-[1.06] font-bold tracking-[-0.045em] text-balance">{title}</p>
      <p className="text-muted-foreground mt-4 mb-10 max-w-md text-lg">{text}</p>
      {children}
    </section>
  )
}
