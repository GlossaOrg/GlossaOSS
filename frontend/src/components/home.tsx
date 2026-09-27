import { Fragment, useEffect, useRef } from 'react'
import { useQueries } from '@tanstack/react-query'
import { animate, motion, useReducedMotion } from 'motion/react'
import { useNavigate } from 'react-router'
import { ArrowRightIcon } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/kit'
import { Flag, languageName, shade, tint } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { day, status, useLocale, useLocaleLists, type Locale, type Release, type Resource } from '@/lib/content'
import { useMe } from '@/lib/me'
import { covers, useProject, type Project } from '@/lib/projects'

/** A language's name behind its flag, in the flow of a sentence. */
function Spoken({ locale }: { locale: string }) {
  return (
    <span className="whitespace-nowrap">
      <Flag locale={locale} className="mr-[0.22em] inline size-[0.7em] align-[-0.02em]" />
      {languageName(locale)}
    </span>
  )
}

/** "a, b and c", with each item already rendered. */
function list(items: React.ReactNode[]) {
  return items.map((item, i) => (
    <Fragment key={i}>
      {i > 0 && (i === items.length - 1 ? ' and ' : ', ')}
      {item}
    </Fragment>
  ))
}

const greeting = () => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

/** The first screen: what the project speaks, and where each language stands. */
export function Home() {
  const { project } = useProject()
  if (!project) return <Statement eyebrow={<Hello />} text="No project yet. An admin creates one first." />
  return <Overview project={project} />
}

function Hello() {
  const { data: me } = useMe()
  const name = me?.name?.split(/\s+/)[0]
  return <>{greeting()}{name ? `, ${name}` : ''}.</>
}

function Overview({ project }: { project: Project }) {
  const navigate = useNavigate()
  const { rows, source, select, locales } = useLocale(project.id)
  const lists = useLocaleLists(project.id, rows)
  const manager = covers(project.role, 'MANAGER')
  const targets = rows.filter((l) => !l.source).sort((a, b) => languageName(a.locale).localeCompare(languageName(b.locale)))
  const listOf = (l: Locale) => lists[rows.indexOf(l)]?.data
  // A caller whose role is one locale's may read no other: those languages are spoken, not shown.
  const readable = targets.filter((l) => !lists[rows.indexOf(l)]?.error)

  if (locales.error) return <Statement eyebrow={<Hello />} text="This project could not be loaded. Reload the page." />
  if (!locales.data) return null
  if (!source) {
    return (
      <Statement eyebrow={<Hello />} text={`${project.name} has no languages yet.`}>
        {manager ? <Button size="lg" onClick={() => navigate('/locales')}>Pick the source language →</Button> : <p className="text-muted-foreground">A manager sets them up first.</p>}
      </Statement>
    )
  }

  const counts = readable.map((l) => tally(listOf(l)))
  const total = counts.reduce((sum, c) => sum + c.total, 0)
  const approved = counts.reduce((sum, c) => sum + c.approved, 0)
  const review = counts.reduce((sum, c) => sum + c.review, 0)
  // Every list holds every resource, so any one that has arrived counts the messages.
  const messages = lists.find((q) => q.data)?.data?.length
  const loaded = messages !== undefined && counts.every((c) => c.loaded)
  const spoken = targets.length > 4 ? [...targets.slice(0, 3).map((l) => <Spoken key={l.locale} locale={l.locale} />), `${targets.length - 3} more`] : targets.map((l) => <Spoken key={l.locale} locale={l.locale} />)
  const waiting = readable.map((l, i) => ({ locale: l, review: counts[i].review })).filter((w) => w.review).sort((a, b) => b.review - a.review)
  const open = (l: Locale) => {
    select(l.locale)
    navigate('/content')
  }

  return (
    <div className="page grid gap-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* The one lilac block: where the project stands, and what is waiting. */}
        <section className="bg-brand grid place-items-center rounded-xl p-4 md:p-8">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
            className="card w-full max-w-xl p-5"
          >
            <p className="eyebrow mb-2"><Hello /></p>
            <p className="font-heading text-[0.9375rem] leading-snug font-bold text-balance">
              {project.name} is written in <Spoken locale={source.locale} />
              {targets.length ? <> and speaks {list(spoken)}.</> : '.'}
            </p>

            <div className="mt-5 flex items-end justify-between gap-4">
              <span className="font-heading text-[2.75rem] leading-none font-extrabold tracking-[-0.045em] tabular-nums">
                {loaded ? <Count to={total ? Math.floor((approved / total) * 100) : 0} suffix="%" /> : '–'}
              </span>
              <span className="text-[0.8125rem] font-bold">approved</span>
            </div>
            {/* Every translation the caller can see: approved, waiting for review, and the rest. */}
            <div className="bg-secondary mt-3 flex h-1.5 overflow-hidden rounded-full" role="img" aria-label={`${approved} of ${total} approved, ${review} waiting for review`}>
              {[
                [approved, 'bg-brand-strong'],
                [review, 'bg-amber-400'],
              ].map(([n, color], i) => (
                <motion.span
                  key={color}
                  className={cn('h-full', color as string)}
                  initial={{ width: 0 }}
                  animate={{ width: `${loaded && total ? ((n as number) / total) * 100 : 0}%` }}
                  transition={{ delay: 0.25 + i * 0.2, duration: 0.8, ease: [0.2, 0, 0, 1] }}
                />
              ))}
            </div>
            <p className="text-muted-foreground mt-2 flex justify-between gap-4 text-xs tabular-nums">
              <span>{loaded ? `${approved} of ${total} translations` : 'Counting…'}</span>
              <span>{messages ?? '–'} {messages === 1 ? 'message' : 'messages'}</span>
            </p>

            <div className="bg-secondary mt-4 flex flex-wrap items-end justify-between gap-4 rounded-lg p-4">
              <div>
                <p className="text-muted-foreground text-xs">Waiting for review</p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-heading text-[1.75rem] leading-none font-extrabold tracking-[-0.04em] tabular-nums">{loaded ? review : '–'}</span>
                  {loaded && !review && <span className="text-muted-foreground text-[0.8125rem]">Nothing to review.</span>}
                </p>
                {waiting.length > 0 && (
                  <p className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {waiting.slice(0, 3).map((w) => (
                      <span key={w.locale.locale} className="inline-flex items-center gap-1.5">
                        <Flag locale={w.locale.locale} className="size-3.5" />
                        {languageName(w.locale.locale)} <b className="text-foreground tabular-nums">{w.review}</b>
                      </span>
                    ))}
                  </p>
                )}
              </div>
              {waiting.length > 0 && (
                <Button onClick={() => open(waiting[0].locale)}>
                  Start reviewing <ArrowRightIcon />
                </Button>
              )}
            </div>
          </motion.div>
        </section>

        <Latest projectId={project.id} locales={readable} manager={manager} />
      </div>

      <section className="card px-2 py-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-4 px-3 pt-3 pb-2">
          <h3>{!targets.length ? 'Nothing to translate into yet' : readable.length < targets.length ? 'Your languages' : 'Where every language stands'}</h3>
          {manager && (
            <button type="button" onClick={() => navigate('/locales')} className="text-muted-foreground hover:text-foreground cursor-pointer text-[0.8125rem] font-semibold transition-colors">
              {targets.length ? 'Manage languages →' : 'Add a language →'}
            </button>
          )}
        </div>
        <ul>
          {readable.map((l, i) => (
            <li key={l.locale} className="border-t first:border-t-0">
              <Tile locale={l} count={counts[i]} delay={i * 0.04} onOpen={() => open(l)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** The dark card: the newest catalog any language has published (§10). */
function Latest({ projectId, locales, manager }: { projectId: number; locales: Locale[]; manager: boolean }) {
  const navigate = useNavigate()
  const manifests = useQueries({
    queries: locales.map((l) => ({
      queryKey: ['manifest', projectId, l.locale],
      queryFn: () => api<Release>(`/api/projects/${projectId}/catalogs/${encodeURIComponent(l.locale)}`),
      retry: false,
    })),
  })
  const releases = manifests.flatMap((m) => (m.data ? [m.data] : []))
  const latest = releases.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const settled = manifests.every((m) => !m.isPending)

  return (
    <section className="bg-ink flex flex-col rounded-xl p-5 text-white">
      <p className="text-xs text-white/60">Releases</p>
      <p className="font-heading mt-2 text-xl leading-tight font-bold tracking-[-0.02em]">
        {!settled ? 'Checking…' : latest ? <>{languageName(latest.locale)} v{latest.version}<br />is live.</> : 'Nothing published yet.'}
      </p>
      {/* One ring per language, solid once it has a catalog out. */}
      <div className="mt-5 flex">
        {locales.map((l, i) => (
          <span key={l.locale} className={cn('-ml-2 size-7 rounded-full border first:ml-0', manifests[i]?.data ? 'border-white' : 'border-white/25')} title={languageName(l.locale)} />
        ))}
      </div>
      <div className="mt-5 border-t border-white/15 pt-3 text-xs">
        <div className="flex gap-8">
          <span className="text-white/60">Published<br /><b className="text-white tabular-nums">{releases.length} of {locales.length}</b></span>
          {latest && <span className="text-white/60">Last<br /><b className="text-white">{day.format(new Date(latest.createdAt))}</b></span>}
        </div>
      </div>
      {manager && (
        <Button className="mt-5 self-start lg:mt-auto" onClick={() => navigate('/releases')}>
          Releases <ArrowRightIcon />
        </Button>
      )}
    </section>
  )
}

type Count = { total: number; approved: number; review: number; loaded: boolean }

function tally(rows?: Resource[]): Count {
  const all = rows ?? []
  return {
    total: all.length,
    approved: all.filter((r) => status(r) === 'approved').length,
    review: all.filter((r) => status(r) === 'review').length,
    loaded: !!rows,
  }
}

/** A number that counts up to itself when it arrives, and straight to the end for reduced motion. */
function Count({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const still = useReducedMotion()
  useEffect(() => {
    const write = (n: number) => ref.current && (ref.current.textContent = `${Math.round(n)}${suffix}`)
    if (still) return void write(to)
    const counting = animate(0, to, { duration: 0.9, ease: [0.2, 0, 0, 1], onUpdate: write })
    return () => counting.stop()
  }, [to, suffix, still])
  return <span ref={ref}>{`${still ? to : 0}${suffix}`}</span>
}

/** A language's row: where it stands, and the way into its content. */
function Tile({ locale, count, delay, onOpen }: { locale: Locale; count: Count; delay: number; onOpen: () => void }) {
  const { total, approved, review, loaded } = count
  const done = loaded && total > 0 && approved === total
  const fresh = loaded && approved === 0 && review === 0

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + delay, duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
      // The row takes on its language's pastel under the pointer: the one place it wears it whole.
      style={{ '--tint': tint(locale.locale) } as React.CSSProperties}
      className="group/tile hover:text-on-tint focus-visible:text-on-tint grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 rounded-lg px-3 py-3 text-left transition-colors duration-300 outline-none hover:bg-(--tint) focus-visible:bg-(--tint) md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_8rem_5.5rem]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <Flag locale={locale.locale} className="size-6 transition-transform duration-300 group-hover/tile:scale-110 group-hover/tile:-rotate-6" />
        <span className="min-w-0">
          <span className="block truncate text-[0.875rem] leading-tight font-bold">{languageName(locale.locale)}</span>
          <span className="text-muted-foreground block font-mono text-[11.5px]">
            {locale.locale}
            {locale.rtl && ' · right to left'}
          </span>
        </span>
      </span>
      <span className="col-span-2 row-start-2 flex items-center gap-3 md:col-span-1 md:col-start-2 md:row-start-1">
        <span className="bg-secondary block h-1.5 flex-1 overflow-hidden rounded-full transition-colors group-hover/tile:bg-black/10">
          <motion.span
            className="block h-full rounded-full"
            style={{ background: shade(locale.locale) }}
            initial={{ width: 0 }}
            animate={{ width: `${total ? (approved / total) * 100 : 0}%` }}
            transition={{ delay: delay + 0.15, duration: 0.6, ease: [0.2, 0, 0, 1] }}
          />
        </span>
        <span className="text-muted-foreground w-16 text-right text-xs tabular-nums">{loaded ? `${approved}/${total}` : '…'}</span>
      </span>
      <span className="hidden md:block">
        {review ? <Badge dot="bg-amber-400">{review} to review</Badge> : done ? <Badge dot="bg-emerald-500">Done</Badge> : fresh ? <Badge>New</Badge> : null}
      </span>
      <span className="col-start-2 row-start-1 text-[0.8125rem] font-bold whitespace-nowrap md:col-start-4 md:text-right">
        {done ? 'Open' : fresh ? 'Start' : 'Continue'}{' '}
        <span aria-hidden className="inline-block transition-transform duration-200 group-hover/tile:translate-x-1">→</span>
      </span>
    </motion.button>
  )
}

function Statement({ eyebrow, text, children }: { eyebrow: React.ReactNode; text: string; children?: React.ReactNode }) {
  return (
    <div className="page">
      <section className="bg-brand grid place-items-center rounded-xl p-4 md:p-8">
        <div className="card w-full max-w-xl p-5">
          <p className="eyebrow mb-2">{eyebrow}</p>
          <p className="font-heading mb-5 text-2xl leading-tight font-extrabold tracking-[-0.03em] text-balance">{text}</p>
          {children}
        </div>
      </section>
    </div>
  )
}
