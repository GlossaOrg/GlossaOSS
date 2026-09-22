import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router'
import { LanguagesIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Flag, languageName } from '@/components/locale'
import { Pattern } from '@/components/pattern'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { covers, useProject, type Project } from '@/lib/projects'
import { state, states, status, useLocale, useResources, type Locale, type Resource, type Status } from '@/lib/content'

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
  if (!project) return <Blank title="No project yet" text="Pick or create one first." />
  return <Board project={project} />
}

function Board({ project }: { project: Project }) {
  const { rows: locales, locale, source, locales: query } = useLocale(project.id)
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

  const ordered = [...locales].sort((a, b) => Number(b.source) - Number(a.source) || a.locale.localeCompare(b.locale))

  const shown = all.filter((r) => {
    if (group && !(group === 'ungrouped' ? !r.key.includes('.') : r.key.startsWith(`${group}.`))) return false
    if (filter && status(r) !== filter) return false
    if (search && !r.key.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (query.error) return <Blank title="Could not load this project" text="Reload the page." />
  if (!query.data) return <Blank title="Loading" text="One moment." />
  if (!source) {
    return (
      <Blank title="No locales yet" text="A project needs its source language before anything can be written.">
        {manager && (
          <Button className="mt-7" onClick={() => navigate('/locales')}>
            <LanguagesIcon />
            Add locales
          </Button>
        )}
      </Blank>
    )
  }

  return (
    <div className="page flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="mb-2">Content</h2>
          <p className="text-muted-foreground text-[17px]">Every message in {project.name}, and where each one stands.</p>
        </div>
        {manager && (
          <Button onClick={() => navigate('/content/new')}>
            <PlusIcon className="transition-transform duration-300 motion-safe:group-hover/button:rotate-90" />
            New message
          </Button>
        )}
      </header>

      <LocaleStrip locales={ordered} selected={locale} projectId={project.id} />

      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="grid content-start gap-1">
          <Group label="All keys" count={all.length} active={!group} onClick={() => setGroup(null)} />
          {groups.map(([name, { total, done }]) => (
            <Group key={name} label={name} count={total} done={done} active={group === name} onClick={() => setGroup(name)} />
          ))}
        </aside>

        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a key" className="bg-background h-8 w-44 pl-8" />
            </div>
            {states.map((s) => {
              const count = all.filter((r) => status(r) === s.value).length
              if (!count && filter !== s.value) return null
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setFilter(filter === s.value ? null : s.value)}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium transition-transform duration-200',
                    'motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none',
                    s.tint,
                    filter === s.value ? 'ring-foreground ring-2' : 'ring-1 ring-transparent',
                  )}
                >
                  {s.label}
                  <span className="opacity-60">{count}</span>
                </button>
              )
            })}
          </div>

          {resources.error ? (
            <p role="alert" className="text-destructive">Could not load the content. Reload the page.</p>
          ) : !resources.data ? (
            <div className="divide-y border-y" aria-busy>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="grid gap-2 py-4" style={{ opacity: 1 - i * 0.22 }}>
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-5 w-full max-w-lg" />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-y py-10">
              <p className="font-medium">{all.length ? 'Nothing matches' : 'No messages yet'}</p>
              <p className="text-muted-foreground text-sm">
                {all.length ? 'Clear the filters to see the rest.' : 'Add the first one and the translators can start.'}
              </p>
            </motion.div>
          ) : (
            <ul className="divide-y border-y">
              <AnimatePresence initial={false}>
                {shown.map((r) => (
                  <motion.li key={r.id} layout="position" {...unfold} className="overflow-hidden">
                    <Row resource={r} rtl={locale?.rtl} translated={!locale?.source} onOpen={() => navigate(`/content/${r.id}`)} />
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

function Row({ resource, rtl, translated, onOpen }: { resource: Resource; rtl?: boolean; translated: boolean; onOpen: () => void }) {
  const s = state(status(resource))
  const dot = resource.key.lastIndexOf('.')

  return (
    <button type="button" onClick={onOpen} className="group/row hover:bg-accent/40 -mx-3 flex w-[calc(100%+1.5rem)] cursor-pointer items-start gap-4 rounded-lg px-3 py-3.5 text-left transition-colors">
      <span className={cn('mt-2 size-2 shrink-0 rounded-full transition-transform duration-300 motion-safe:group-hover/row:scale-125', s.dot)} title={s.says} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[13px]">
          {dot > 0 && <span className="text-muted-foreground">{resource.key.slice(0, dot + 1)}</span>}
          <span className="font-medium">{resource.key.slice(dot + 1)}</span>
        </span>
        <span className="mt-1 block text-[15px] leading-relaxed">
          <Pattern text={resource.sourcePayload.pattern} />
        </span>
        {translated && resource.payload ? (
          <span className="text-muted-foreground mt-1 block text-[15px] leading-relaxed">
            <Pattern text={resource.payload.pattern} rtl={rtl} />
          </span>
        ) : null}
      </span>
      <span className={cn('shrink-0 rounded-full px-2 py-px text-xs font-medium', s.tint)}>{s.label}</span>
    </button>
  )
}

function Group({ label, count, done, active, onClick }: { label: string; count: number; done?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'link-bg-animated grid cursor-pointer gap-1.5 rounded-lg px-3 py-2 text-left',
        active ? 'bg-brand/10 text-brand' : 'hover:bg-accent',
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="text-xs opacity-60">{count}</span>
      </span>
      {done !== undefined && (
        <span className="bg-foreground/10 block h-1 overflow-hidden rounded-full">
          <motion.span
            className="bg-brand block h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${count ? (done / count) * 100 : 0}%` }}
            transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
          />
        </span>
      )}
    </button>
  )
}

/** Every locale at once, each with how far it has got. Switching is instant: the lists are already here. */
function LocaleStrip({ locales, selected, projectId }: { locales: Locale[]; selected?: Locale; projectId: number }) {
  const { select } = useLocale(projectId)
  // ponytail: one list per locale, so a chip can show real progress. Batch it server-side when a
  // project holds thousands of keys and this becomes N large responses.
  const lists = useQueries({
    queries: locales.map((l) => ({
      queryKey: ['resources', projectId, l.locale],
      queryFn: () => api<Resource[]>(`/api/projects/${projectId}/resources?locale=${encodeURIComponent(l.locale)}`),
      select: (rows: Resource[]) => rows.filter((r) => !r.archived),
    })),
  })

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {locales.map((l, i) => {
        const rows = lists[i].data ?? []
        const done = rows.filter((r) => status(r) === 'approved').length
        const active = selected?.locale === l.locale
        return (
          <button
            key={l.locale}
            type="button"
            onClick={() => select(l.locale)}
            className={cn(
              'group/loc relative flex shrink-0 cursor-pointer items-center gap-2.5 rounded-xl border py-2 pr-4 pl-2 transition-all duration-200',
              active ? 'border-brand bg-brand/5' : 'hover:bg-accent/50 motion-safe:hover:-translate-y-0.5',
            )}
          >
            <Flag locale={l.locale} className="size-8" />
            <span className="grid gap-1 text-left">
              <span className="flex items-center gap-1.5 text-sm leading-none font-medium">
                {languageName(l.locale)}
                <span className="text-muted-foreground font-mono text-[11px] font-normal">{l.locale}</span>
                {l.source && <span className="eyebrow text-brand">source</span>}
                {l.rtl && <span className="eyebrow opacity-50">rtl</span>}
              </span>
              <span className="text-muted-foreground text-xs leading-none">
                {rows.length ? `${Math.round((done / rows.length) * 100)}% approved` : 'nothing yet'}
              </span>
              <span className="bg-foreground/10 block h-1 w-28 overflow-hidden rounded-full">
                <motion.span
                  className={cn('block h-full rounded-full', active ? 'bg-brand' : 'bg-foreground/30')}
                  initial={{ width: 0 }}
                  animate={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }}
                  transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
                />
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Blank({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center p-10 text-center">
      <div className="bg-brand/10 text-brand mb-7 grid size-14 place-items-center rounded-xl">
        <LanguagesIcon className="size-6 motion-safe:animate-[float_4s_ease-in-out_infinite]" />
      </div>
      <h2 className="mb-3">{title}</h2>
      <p className="text-muted-foreground max-w-md text-[17px] leading-relaxed text-balance">{text}</p>
      {children}
    </section>
  )
}
