import { Fragment } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router'
import { ArrowRightIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from 'cn'
import { Flag, languageName, shade, tint } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { day, readable as readableOf, resourcesQuery, status, useLocale, useProgress, waiting as needsWork, type Locale, type Progress, type Status } from '@/lib/content'
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
  const progress = useProgress(project.id)
  const client = useQueryClient()
  const manager = covers(project.role, 'MANAGER')
  const targets = rows.filter((l) => !l.source)
  const of = (l: Locale) => progress.data?.find((p) => p.locale === l.locale)
  // A caller whose role is one locale's may read no other: those languages are spoken, not shown.
  const readable = readableOf(targets, progress.data)

  if (locales.error) return <Statement eyebrow={<Hello />} text="This project could not be loaded. Reload the page." />
  if (!locales.data) return null
  if (!source) {
    return (
      <Statement eyebrow={<Hello />} text={`${project.name} has no languages yet.`}>
        {manager ? <Button size="lg" onClick={() => navigate('/locales')}>Pick the source language</Button> : <p className="text-muted-foreground">A manager sets them up first.</p>}
      </Statement>
    )
  }

  const counts = readable.map(of)
  const sum = (k: 'total' | 'approved' | 'review') => counts.reduce((n, c) => n + (c?.[k] ?? 0), 0)
  const [total, approved, review] = [sum('total'), sum('approved'), sum('review')]
  // Every locale counts every resource, so any one of them counts the messages.
  const messages = progress.data?.[0]?.total
  const loaded = messages !== undefined && counts.every(Boolean)
  const shown = targets.length > 4 ? targets.slice(0, 3) : targets
  const spoken = [...shown.map((l) => <Spoken key={l.locale} locale={l.locale} />), ...(shown === targets ? [] : [`${targets.length - 3} more`])]
  const waiting = readable.map((l, i) => ({ locale: l, review: counts[i]?.review ?? 0 })).filter((w) => w.review).sort((a, b) => b.review - a.review)
  // Straight into the first message that needs doing; the list when there is none, or it cannot be read.
  const open = async (l: Locale, next?: Status | 'translate') => {
    select(l.locale)
    const rows = next ? await client.fetchQuery(resourcesQuery(project.id, l.locale)).catch(() => []) : []
    const first = rows.find((r) => !r.archived && (next === 'review' ? status(r) === 'review' : needsWork(r, false)))
    navigate(first ? `/content/${first.id}` : '/content')
  }

  return (
    <div className="page @container/home grid gap-3">
      <div className="grid gap-3 @5xl/home:grid-cols-[minmax(0,1fr)_18rem]">
        {/* One surface, not a card inside a block: the lilac card is the hero itself. */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
          className="bg-brand @container/hero min-w-0 rounded-xl p-6 md:p-8"
        >
          {/* Two columns rather than rows stretched edge to edge: what the project is, then where it stands. */}
          <div className="grid gap-8 @3xl/hero:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] @3xl/hero:items-end">
            <div className="min-w-0">
              <p className="text-sm font-semibold opacity-65"><Hello /></p>
              <p className="font-heading mt-3 text-2xl leading-tight font-extrabold tracking-[-0.025em] text-balance @3xl/hero:text-3xl">
                {project.name} is written in <Spoken locale={source.locale} />
                {targets.length ? <> and speaks {list(spoken)}.</> : '.'}
              </p>
            </div>

            <div>
              <p className="flex items-baseline gap-2.5">
                <span className="font-heading text-[3.5rem] leading-none font-extrabold tracking-[-0.045em] tabular-nums">
                  {loaded ? `${total ? Math.floor((approved / total) * 100) : 0}%` : '–'}
                </span>
                <span className="text-base font-bold">approved</span>
              </p>
              {/* Every translation the caller can see: approved, waiting for review, and the rest. */}
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-black/10" role="img" aria-label={`${approved} of ${total} approved, ${review} waiting for review`}>
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
              <p className="mt-2 text-sm tabular-nums opacity-65">
                {loaded ? `${approved} of ${total} translations` : progress.isError ? 'Some languages could not be loaded.' : 'Counting…'}
                {messages !== undefined && <> · {messages} {messages === 1 ? 'message' : 'messages'}</>}
              </p>
            </div>
          </div>

          {/* What is waiting, on the same surface: a rule, not a box inside the card. */}
          {waiting.length > 0 && (
            <div className="mt-8 flex flex-col gap-4 border-t border-black/10 pt-5 @xl/hero:flex-row @xl/hero:items-center">
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <strong className="font-heading inline-flex h-9 items-center text-2xl leading-none font-extrabold tracking-[-0.04em] tabular-nums">{review}</strong>
                <span className="inline-flex h-9 items-center whitespace-nowrap">waiting for review</span>
                {waiting.slice(0, 3).map((w) => (
                  <span key={w.locale.locale} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap opacity-70">
                    <Flag locale={w.locale.locale} className="size-3.5" />
                    {languageName(w.locale.locale)} <b className="tabular-nums">{w.review}</b>
                  </span>
                ))}
              </div>
              <Button variant="ink" className="self-start @xl/hero:ml-auto @xl/hero:self-auto" onClick={() => open(waiting[0].locale, 'review')}>
                Start reviewing <ArrowRightIcon />
              </Button>
            </div>
          )}
        </motion.section>

        <Latest locales={readable} progress={progress.data} failed={progress.isError} manager={manager} />
      </div>

      <section className="card px-2 py-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-4 px-3 pt-3 pb-2">
          <h3>{!targets.length ? 'Nothing to translate into yet' : 'Languages'}</h3>
          {manager && (
            <button type="button" onClick={() => navigate('/locales')} className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-semibold transition-colors">
              {targets.length ? 'Manage languages' : 'Add a language'}
            </button>
          )}
        </div>
        <ul>
          {readable.map((l, i) => (
            <li key={l.locale} className="border-t first:border-t-0">
              <Tile locale={l} progress={counts[i]} delay={i * 0.04} onOpen={(next) => open(l, next)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** The dark card: the newest catalog any language has published (§10). */
function Latest({ locales, progress, failed, manager }: { locales: Locale[]; progress?: Progress[]; failed: boolean; manager: boolean }) {
  const navigate = useNavigate()
  const release = (l: Locale) => progress?.find((p) => p.locale === l.locale)?.release
  const releases = locales.flatMap((l) => release(l) ?? [])
  const latest = [...releases].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  return (
    <section className="bg-ink flex flex-col rounded-xl p-5 text-white">
      <div className="flex h-8 items-center justify-between gap-3">
        <p className="text-xs font-semibold text-white/60">Releases</p>
        {manager && (
          <Button variant="ghost" size="icon-sm" aria-label="Open releases" className="-mr-1 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => navigate('/releases')}>
            <ChevronRightIcon />
          </Button>
        )}
      </div>
      <p className="font-heading mt-2 text-xl leading-tight font-bold tracking-[-0.02em]">
        {failed ? 'Release status unavailable.' : !progress ? 'Checking…' : latest ? <>{languageName(latest.locale)} v{latest.version}<br />is live.</> : 'Nothing published yet.'}
      </p>
      {/* One flag per language: in colour once it has a catalog out, a quiet outline until then. */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        {locales.map((l) =>
          release(l) ? (
            <Flag key={l.locale} locale={l.locale} className="size-6 transition-transform duration-200 hover:-translate-y-0.5 hover:scale-115" />
          ) : (
            <span key={l.locale} title={`${languageName(l.locale)}: not published`} className="group/flag grid size-6 place-items-center rounded-full border border-dashed border-white/30 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:scale-115 hover:border-white/60">
              <Flag locale={l.locale} className="size-3.5 opacity-50 grayscale transition-[opacity,filter] duration-200 group-hover/flag:opacity-100 group-hover/flag:grayscale-0" />
            </span>
          ),
        )}
      </div>
      <div className="mt-5 border-t border-white/15 pt-3 text-xs">
        <div className="flex gap-8">
          <span className="text-white/60">Published<br /><b className="text-white tabular-nums">{releases.length} of {locales.length}</b></span>
          {latest && <span className="text-white/60">Last<br /><b className="text-white">{day.format(new Date(latest.createdAt))}</b></span>}
        </div>
      </div>
    </section>
  )
}

/** A language's row: where it stands, and the one thing to do next in it. */
function Tile({ locale, progress, delay, onOpen }: { locale: Locale; progress?: Progress; delay: number; onOpen: (next?: 'review' | 'translate') => void }) {
  const { total = 0, approved = 0, review = 0 } = progress ?? {}
  const loaded = !!progress
  const todo = total - approved - review
  const [action, next] = !loaded ? ['Open', undefined] : review ? [`Review ${review}`, 'review' as const] : todo ? [`Translate ${todo}`, 'translate' as const] : ['Open', undefined]

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(next)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + delay, duration: 0.3, ease: 'easeOut' }}
      style={{ '--tint': tint(locale.locale) } as React.CSSProperties}
      className="group/tile hover:text-on-tint focus-visible:text-on-tint hover:bg-(--tint) focus-visible:bg-(--tint) grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 rounded-lg px-3 py-3 text-left transition-colors duration-300 outline-none md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_8rem]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <Flag locale={locale.locale} className="size-6 transition-transform duration-300 group-hover/tile:scale-110 group-hover/tile:-rotate-6" />
        <span className="min-w-0">
          <span className="block truncate text-sm leading-tight font-bold">{languageName(locale.locale)}</span>
          <span className="text-muted-foreground block font-mono text-xs">
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
      <span className="col-start-2 row-start-1 text-sm font-bold whitespace-nowrap md:col-start-3 md:text-right">{action}</span>
    </motion.button>
  )
}

function Statement({ eyebrow, text, children }: { eyebrow: React.ReactNode; text: string; children?: React.ReactNode }) {
  return (
    <div className="page">
      <section className="bg-brand rounded-xl p-6 md:p-10">
        <p className="mb-2 text-[11px] font-medium tracking-[0.07em] uppercase opacity-60">{eyebrow}</p>
        <p className="font-heading mb-6 max-w-[28ch] text-3xl leading-tight font-extrabold tracking-[-0.03em] text-balance">{text}</p>
        {children}
      </section>
    </div>
  )
}
