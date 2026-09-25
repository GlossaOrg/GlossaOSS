import { Fragment } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router'
import { languageName, tint } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { status, useLocale, useLocaleLists, type Locale, type Resource } from '@/lib/content'
import { useMe } from '@/lib/me'
import { covers, useProject, type Project } from '@/lib/projects'

/** A language's name on its own pastel, in the flow of a sentence. */
function Spoken({ locale }: { locale: string }) {
  return (
    <span className="text-on-tint rounded-[0.24em] px-[0.18em] pb-[0.04em] whitespace-nowrap [box-decoration-break:clone]" style={{ background: tint(locale) }}>
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
        {manager ? <Button size="lg" onClick={() => navigate('/locales')}>Pick the source language →</Button> : <p className="text-muted-foreground text-lg">A manager sets them up first.</p>}
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

  return (
    <div className="page">
      <p className="text-muted-foreground mb-4">
        <Hello />
      </p>
      <p className="font-heading max-w-[19ch] text-[clamp(2.25rem,4.6vw,4.25rem)] leading-[1.06] font-bold tracking-[-0.045em] text-balance">
        {project.name} is written in <Spoken locale={source.locale} />
        {targets.length ? <> and speaks {list(spoken)}.</> : '.'}
        {loaded && total > 0 && approved < total && ' Almost.'}
      </p>

      <dl className="border-foreground mt-12 mb-16 flex flex-wrap gap-x-16 gap-y-6 border-t pt-7">
        <Stat value={messages} label={messages === 1 ? 'message' : 'messages'} />
        <Stat value={readable.length} label={readable.length === 1 ? 'language to translate into' : 'languages to translate into'} />
        {readable.length > 0 && <Stat value={loaded ? `${total ? Math.floor((approved / total) * 100) : 0}%` : undefined} label="approved" />}
        {readable.length > 0 && <Stat value={loaded ? review : undefined} label="waiting for review" />}
      </dl>

      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
        <h3>{!targets.length ? 'Nothing to translate into yet' : readable.length < targets.length ? 'Your languages' : 'Where every language stands'}</h3>
        {manager && (
          <button type="button" onClick={() => navigate('/locales')} className="cursor-pointer font-semibold underline-offset-4 hover:underline">
            {targets.length ? 'Manage languages →' : 'Add a language →'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(16.5rem,1fr))] gap-4">
        {readable.map((l, i) => (
          <Tile
            key={l.locale}
            locale={l}
            count={counts[i]}
            delay={i * 0.04}
            onOpen={() => {
              select(l.locale)
              navigate('/content')
            }}
          />
        ))}
      </div>
    </div>
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

function Stat({ value, label }: { value?: number | string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="font-heading text-[clamp(2.5rem,4.2vw,3.75rem)] leading-none font-bold tracking-[-0.045em] tabular-nums">{value ?? '–'}</dd>
      <dd className="text-muted-foreground mt-1">{label}</dd>
    </div>
  )
}

function Tile({ locale, count, delay, onOpen }: { locale: Locale; count: Count; delay: number; onOpen: () => void }) {
  const { total, approved, review, loaded } = count
  const done = loaded && total > 0 && approved === total
  const fresh = loaded && approved === 0 && review === 0
  const badge = review ? `${review} to review` : done ? 'Done' : fresh ? 'New' : null

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
      whileHover={{ y: -3 }}
      className="text-on-tint group/tile flex min-h-72 cursor-pointer flex-col rounded-[28px] p-6 text-left outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
      style={{ background: tint(locale.locale) }}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="font-heading text-[64px] leading-[0.8] font-extrabold tracking-[-0.05em]">{locale.locale}</span>
        {badge && <span className={done ? 'rounded-full bg-[#0E0E0E] px-3 py-1 text-[13px] font-semibold text-white' : 'rounded-full bg-white px-3 py-1 text-[13px] font-semibold'}>{badge}</span>}
      </span>
      <span className="font-heading mt-auto pt-8 text-[22px] leading-tight font-bold tracking-[-0.02em]">
        {languageName(locale.locale)}
        {locale.rtl && <span className="ml-2 align-middle text-xs font-semibold tracking-normal opacity-50">right to left</span>}
      </span>
      <span className="mt-3.5 mb-2.5 block h-1.5 overflow-hidden rounded-full bg-black/10">
        <motion.span
          className="block h-full rounded-full bg-[#0E0E0E]"
          initial={{ width: 0 }}
          animate={{ width: `${total ? (approved / total) * 100 : 0}%` }}
          transition={{ delay: delay + 0.15, duration: 0.6, ease: [0.2, 0, 0, 1] }}
        />
      </span>
      <span className="flex items-center justify-between gap-3 text-sm">
        <span className="opacity-65">{loaded ? `${approved} of ${total} approved` : 'Counting…'}</span>
        <span className="inline-flex h-9 items-center rounded-full bg-[#0E0E0E] px-4 font-semibold text-white transition-transform group-hover/tile:translate-x-0.5">
          {done ? 'Open' : fresh ? 'Start' : 'Continue'} →
        </span>
      </span>
    </motion.button>
  )
}

function Statement({ eyebrow, text, children }: { eyebrow: React.ReactNode; text: string; children?: React.ReactNode }) {
  return (
    <div className="page">
      <p className="text-muted-foreground mb-4">{eyebrow}</p>
      <p className="font-heading mb-10 max-w-[19ch] text-[clamp(2.25rem,4.6vw,4.25rem)] leading-[1.06] font-bold tracking-[-0.045em] text-balance">{text}</p>
      {children}
    </div>
  )
}
