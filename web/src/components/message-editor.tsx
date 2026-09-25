import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { cn } from 'cn'
import { Highlight, IcuEditor, ink } from '@/components/icu-editor'
import { Badge, Select } from '@/components/kit'
import { toast } from '@/components/ui/sonner'
import { Dot, languageName } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Splash } from '@/components/splash'
import { api } from '@/lib/api'
import { covers, useProject, type Project } from '@/lib/projects'
import {
  day, state, status, useDetail, useLocale, useLocaleLists,
  type Analysis, type Contract, type Detail, type Locale, type Revision, type Variable,
} from '@/lib/content'

const unfold = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease: [0.2, 0, 0, 1] },
} as const

/** Fixed once per load: a moving default would re-render the preview forever. */
const NOW = new Date().toISOString()

function useDebounced<T>(value: T, ms = 300) {
  const [held, setHeld] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setHeld(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return held
}

/**
 * The server's verdict on a pattern as it is typed. `fixed` is a translation's contract, which it
 * may not change; a source passes null and has its contract read off what it writes.
 */
function useCheck(projectId: number, locale: Locale, pattern: string, fixed: Contract | null) {
  const probe = useDebounced(JSON.stringify({ pattern, contract: fixed }))
  const analysis = useQuery({
    queryKey: ['analyze', projectId, locale.locale, probe],
    queryFn: () => {
      const body = JSON.parse(probe) as { pattern: string; contract: Contract | null }
      return api<Analysis>(`/api/projects/${projectId}/messages/${locale.locale}/analyze`, {
        method: 'POST',
        json: { payload: { pattern: body.pattern }, contract: body.contract, complete: false },
      })
    },
    retry: false,
    enabled: pattern.trim().length > 0,
    placeholderData: (previous) => previous,
  })
  // The server's wording assumes you own the contract; a translator does not, so say what is missing.
  const unplaced = fixed ? Object.keys(fixed).filter((name) => !new RegExp(`\\{\\s*${name}\\s*[,}]`).test(pattern)) : []
  const problem = !pattern.trim()
    ? 'Write the message.'
    : unplaced.length
      ? `Still to place: ${unplaced.join(', ')}.`
      : ((analysis.error as { detail?: string } | null)?.detail ?? null)
  const at = /index (\d+)/.exec(problem ?? '')
  return {
    contract: fixed ?? analysis.data?.contract ?? {},
    problem: problem?.replace(/^Invalid ICU (pattern|formatter): /, '').replace(/:? ?\[at pattern index \d+\]/, '') ?? null,
    missing: analysis.data?.missing ?? [],
    checking: analysis.isFetching,
    error: at ? Number(at[1]) : undefined,
  }
}

/** §6's editor. Routed rather than opened in place: a translator's link to one message has to work. */
export function MessageEditor() {
  const { resource: param } = useParams()
  const { project } = useProject()
  if (!project) return <Splash className="min-h-[60svh]" failed>No project selected.</Splash>
  return <Loader id={Number(param)} project={project} />
}

function Loader({ id, project }: { id: number; project: Project }) {
  const { locale, source } = useLocale(project.id)
  const detail = useDetail(project.id, id, locale?.locale)

  if (detail.error) return <Splash className="min-h-[60svh]" failed>This message could not be loaded.</Splash>
  if (!detail.data || !locale || !source) return <Splash className="min-h-[60svh]">Loading…</Splash>
  return <Editor key={`${id}-${locale.locale}`} detail={detail.data} locale={locale} source={source} project={project} />
}

function Editor({ detail, locale, source, project }: { detail: Detail; locale: Locale; source: Locale; project: Project }) {
  const { resource, revisions, events } = detail
  const client = useQueryClient()
  const target = locale.locale
  const origin = target === source.locale
  const reviewer = covers(project.role, 'REVIEWER')
  const manager = covers(project.role, 'MANAGER')

  const sourceRevision = revisions.find((r) => r.id === resource.sourceRevisionId)!
  const head = revisions.find((r) => r.id === resource.headRevisionId)
  const stored = head?.payload.pattern ?? ''
  const pending = resource.pendingRevisionId != null

  const [pattern, setPattern] = useState(stored)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [conflict, setConflict] = useState(false)
  const check = useCheck(project.id, locale, pattern, origin ? null : sourceRevision.contract)

  const refresh = () => client.invalidateQueries({ queryKey: ['resource', project.id, resource.id] })
  const settled = () => client.invalidateQueries({ queryKey: ['resources', project.id] }).then(refresh)
  const variant = `/api/projects/${project.id}/resources/${resource.id}/variants/${target}`

  const save = useMutation({
    // A locale with no revision yet has no head, and the server reads that as 0.
    mutationFn: () =>
      api(variant, { method: 'PUT', json: { expectedHeadRevisionId: resource.headRevisionId ?? 0, sourceRevisionId: resource.sourceRevisionId, payload: { pattern } } }),
    onSuccess: settled,
    onError: (e: { status?: number }) => setConflict(e.status === 409),
  })
  const decide = useMutation({
    mutationFn: (approve: boolean) => api(`${variant}/review`, { method: 'POST', json: { revisionId: resource.pendingRevisionId, approve } }),
    onSuccess: settled,
  })
  const restore = useMutation({
    mutationFn: (revisionId: number) =>
      api(`${variant}/revert`, { method: 'POST', json: { revisionId, expectedHeadRevisionId: resource.headRevisionId ?? 0, sourceRevisionId: resource.sourceRevisionId } }),
    onSuccess: settled,
  })
  // §9: the server stores nothing, so the answer is the caller's to keep or drop. It reports its own
  // refusals, which are the only ones worth reading: off, out of actions, or a provider that failed.
  const suggest = async () => {
    try {
      const answer = await api<{ pattern: string }>(`/api/projects/${project.id}/messages/${target}/translate`, {
        method: 'POST',
        json: { payload: sourceRevision.payload, contract: sourceRevision.contract, context: resource.context },
      })
      return answer.pattern
    } catch (error) {
      toast.error((error as { detail?: string }).detail ?? 'Could not reach the AI provider.')
      return null
    }
  }

  const archive = useMutation({
    mutationFn: (archived: boolean) => api(`/api/projects/${project.id}/resources/${resource.id}/archive`, { method: 'PUT', json: { archived } }),
    onSuccess: settled,
  })

  const s = state(status(resource))
  const dirty = pattern !== stored

  return (
    <div className="page flex flex-col gap-6">
      <BackLink />
      <header className="mb-4 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="text-muted-foreground mb-3 font-mono text-sm break-all">{resource.key}</p>
          <h2 className="break-all">{resource.key.slice(resource.key.lastIndexOf('.') + 1)}</h2>
          {resource.context && <p className="text-muted-foreground mt-4 max-w-[52ch] text-lg">{resource.context}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge dot={s.dot} className="h-10 px-4 text-sm">{s.label}</Badge>
          <LocaleSwitch project={project} locale={locale} />
          {manager && (
            <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => archive.mutate(!resource.archived)}>
              {resource.archived ? 'Restore' : 'Archive'}
            </Button>
          )}
        </div>
      </header>

      <IcuEditor
        role={origin ? 'Source' : 'Translation'}
        reference={origin ? undefined : { locale: source, pattern: sourceRevision.payload.pattern }}
        suggest={origin ? undefined : suggest}
        value={pattern}
        onChange={setPattern}
        locale={locale}
        variables={origin ? undefined : sourceRevision.contract}
        problem={check.problem}
        missing={check.missing}
        checking={check.checking}
        error={check.error}
      />

      <Tester
        projectId={project.id}
        locale={locale}
        pattern={pattern}
        contract={check.contract}
        values={values}
        onValues={setValues}
        ready={!check.problem}
        reference={origin ? undefined : { locale: source, pattern: sourceRevision.payload.pattern, contract: sourceRevision.contract }}
      />

      <AnimatePresence initial={false}>
        {conflict && (
          <motion.div {...unfold} className="overflow-hidden">
            <div className="bg-destructive/6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl py-3 pr-3 pl-5 text-sm">
              <p className="min-w-60 flex-1">{(save.error as { detail?: string } | null)?.detail ?? 'This value changed.'} Your text is still here.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setConflict(false)
                  refresh()
                }}
              >
                Reload and keep my text
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {pending && (
        <div className="bg-secondary flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[20px] p-5">
          <p className="min-w-60 flex-1">
            <Badge dot="bg-amber-400" className="bg-background mb-2">In review</Badge>
            <span className="block font-semibold">A proposal is waiting{head?.machine ? ' from an API key' : ''}.</span>
            <span className="text-muted-foreground block text-sm">{reviewer ? 'Nothing else can be written until it is decided.' : 'A reviewer decides next.'}</span>
          </p>
          {reviewer && (
            <div className="flex gap-2">
              <Button variant="outline" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
                Send back
              </Button>
              <Button disabled={decide.isPending} onClick={() => decide.mutate(true)}>
                Approve
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" disabled={!!check.problem || save.isPending || pending || !dirty || (origin && !manager)} onClick={() => save.mutate()}>
          {reviewer ? 'Save' : 'Propose'}
        </Button>
        {dirty && <Button size="lg" variant="ghost" onClick={() => setPattern(stored)}>Discard</Button>}
        {origin && !manager && <span className="text-muted-foreground text-sm">Only a manager edits the source.</span>}
        {!reviewer && !origin && <span className="text-muted-foreground text-sm">Saved as a proposal for review.</span>}
      </div>

      <History
        locale={target}
        revisions={revisions.filter((r) => r.locale === target)}
        events={events}
        approved={resource.approvedRevisionId}
        onRestore={(id) => restore.mutate(id)}
        busy={restore.isPending}
      />
    </div>
  )
}

/** The language being edited, switchable in place: the editor remounts on the other locale's revisions. */
function LocaleSwitch({ project, locale }: { project: Project; locale: Locale }) {
  const { rows, select } = useLocale(project.id)
  const lists = useLocaleLists(project.id, rows)
  // Only what the caller may read: a role limited to one locale is refused the others.
  const readable = rows.filter((_, i) => !lists[i]?.error)
  if (readable.length < 2) return null
  return (
    <Select lead={<Dot locale={locale.locale} />} value={locale.locale} aria-label="Language" onChange={(e) => select(e.target.value)}>
      {readable.map((l) => (
        <option key={l.locale} value={l.locale}>
          {languageName(l.locale)}{l.source ? ' (source)' : ''}
        </option>
      ))}
    </Select>
  )
}

/** A new resource is written in the source locale and approved at once (§8). */
export function NewMessage() {
  const { project } = useProject()
  const { source } = useLocale(project?.id ?? 0)
  if (!project) return <Splash className="min-h-[60svh]" failed>No project selected.</Splash>
  if (!source) return <Splash className="min-h-[60svh]">Loading…</Splash>
  return <Composer project={project} source={source} />
}

function Composer({ project, source }: { project: Project; source: Locale }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const [key, setKey] = useState('')
  const [context, setContext] = useState('')
  const [pattern, setPattern] = useState('')
  const [values, setValues] = useState<Record<string, unknown>>({})
  const check = useCheck(project.id, source, pattern, null)

  const create = useMutation({
    // No contract: the server reads it off the message, at every depth.
    mutationFn: () =>
      api<{ id: number }>(`/api/projects/${project.id}/resources`, {
        method: 'POST',
        json: { key: key.trim(), context: context.trim() || null, fieldType: 'message', payload: { pattern } },
      }),
    onSuccess: (created) => client.invalidateQueries({ queryKey: ['resources', project.id] }).then(() => navigate(`/content/${created.id}`)),
  })

  return (
    <div className="page flex flex-col gap-6">
      <BackLink />
      <h2 className="mb-4">New message</h2>

      <div className="flex flex-wrap gap-4">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Key</span>
          <Input value={key} onChange={(e) => setKey(e.target.value)} autoFocus maxLength={255} placeholder="checkout.items" className="w-72 font-mono text-[13px]" />
        </label>
        <label className="grid min-w-60 flex-1 gap-1.5">
          <span className="text-sm font-medium">
            Context <span className="text-muted-foreground font-normal">(optional)</span>
          </span>
          <Input value={context} onChange={(e) => setContext(e.target.value)} maxLength={255} placeholder="What a translator needs to know" />
        </label>
      </div>

      <IcuEditor
        role="Source"
        templates
        value={pattern}
        onChange={setPattern}
        locale={source}
        problem={check.problem}
        missing={check.missing}
        checking={check.checking}
        error={check.error}
      />

      <Tester projectId={project.id} locale={source} pattern={pattern} contract={check.contract} values={values} onValues={setValues} ready={!check.problem} />

      {create.error ? <p role="alert" className="text-destructive text-sm">{(create.error as { detail?: string }).detail ?? 'The message could not be created.'}</p> : null}
      <div className="flex gap-2">
        <Button size="lg" disabled={!key.trim() || !!check.problem || create.isPending} onClick={() => create.mutate()}>
          Create message
        </Button>
        <Button size="lg" variant="ghost" onClick={() => navigate('/content')}>Cancel</Button>
      </div>
    </div>
  )
}

function BackLink() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate('/content')}
      className="text-muted-foreground hover:text-foreground inline-flex w-fit cursor-pointer items-center gap-1.5 text-sm font-medium transition-colors"
    >
      <ArrowLeftIcon className="size-4" />
      Content
    </button>
  )
}

/** Every variable gets a control of its own type, and the message renders as the server would render it. */
function Tester({ projectId, locale, pattern, contract, values, onValues, ready, reference }: {
  projectId: number
  locale: Locale
  pattern: string
  contract: Contract
  values: Record<string, unknown>
  onValues: (values: Record<string, unknown>) => void
  ready: boolean
  reference?: { locale: Locale; pattern: string; contract: Contract }
}) {
  const filled = Object.fromEntries(Object.entries(contract).map(([name, variable]) => [name, values[name] ?? fallback(variable)]))
  const shot = useDebounced(JSON.stringify({ pattern, contract, values: filled }), 350)
  const render = (target: string, body: () => object, enabled: boolean) => ({
    queryKey: ['preview', projectId, target, shot],
    queryFn: () => api<{ text: string }>(`/api/projects/${projectId}/messages/${target}/preview`, { method: 'POST', json: body() }),
    retry: false,
    enabled,
  })
  const shown = useQuery(render(locale.locale, () => {
    const body = JSON.parse(shot) as { pattern: string; contract: Contract; values: object }
    return { payload: { pattern: body.pattern }, contract: body.contract, values: body.values }
  }, ready))
  const original = useQuery(render(reference?.locale.locale ?? '', () => {
    const body = JSON.parse(shot) as { values: object }
    return { payload: { pattern: reference!.pattern }, contract: reference!.contract, values: body.values }
  }, ready && !!reference))

  const entries = Object.entries(contract)
  return (
    <section className="rounded-[28px] border">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-6 pt-5">
        <h3 className="text-xl">Try it</h3>
        <span className="text-muted-foreground text-sm">
          {entries.length ? `Change a value and read what people will see.` : 'This is what people will see.'}
        </span>
      </header>

      {entries.length > 0 && (
        <div className="grid gap-x-8 gap-y-4 px-6 pt-5 md:grid-cols-2">
          {entries.map(([name, variable]) => (
            <Value key={name} name={name} variable={variable} value={filled[name]} onChange={(v) => onValues({ ...values, [name]: v })} />
          ))}
        </div>
      )}

      <div className="grid gap-3 px-6 pt-6 pb-6">
        <Rendered label={locale.locale} text={ready ? shown.data?.text : undefined} rtl={locale.rtl} strong />
        {reference && <Rendered label={reference.locale.locale} text={original.data?.text} rtl={reference.locale.rtl} />}
      </div>
    </section>
  )
}

function Rendered({ label, text, rtl, strong }: { label: string; text?: string; rtl?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="text-muted-foreground flex w-16 shrink-0 items-center gap-1.5 font-mono text-xs">
        <Dot locale={label} />
        {label}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={text ?? 'empty'}
          dir={rtl ? 'rtl' : undefined}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className={cn('min-w-0 [overflow-wrap:anywhere]', strong ? 'font-heading text-[26px] leading-tight font-bold tracking-[-0.03em]' : 'text-muted-foreground text-[17px]', !text && 'text-muted-foreground/50')}
        >
          {text ?? '…'}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}

function Value({ name, variable, value, onChange }: { name: string; variable: Variable; value: unknown; onChange: (value: unknown) => void }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-[13px] font-semibold">{name}</span>
        <span className="text-muted-foreground text-xs">{variable.type.toLowerCase()}</span>
      </span>
      {variable.type === 'NUMBER' ? (
        <span className="flex items-center gap-3">
          <input type="range" min={0} max={30} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} className="accent-foreground h-1 flex-1 cursor-pointer" />
          <Input type="number" value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} className="w-24" />
        </span>
      ) : variable.type === 'BOOLEAN' ? (
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="accent-foreground size-5 cursor-pointer" />
      ) : variable.type === 'SELECT' ? (
        <span className="flex flex-wrap gap-1">
          {variable.values.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={cn(
                'h-9 cursor-pointer rounded-full px-4 text-sm font-medium transition-colors motion-safe:active:scale-95',
                value === option ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent',
              )}
            >
              {option}
            </button>
          ))}
        </span>
      ) : variable.type === 'TEMPORAL' ? (
        <Input type="datetime-local" value={String(value).slice(0, 16)} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : NOW)} />
      ) : (
        <Input value={String(value)} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

function fallback(variable: Variable): unknown {
  switch (variable.type) {
    case 'NUMBER':
      return 1
    case 'BOOLEAN':
      return true
    case 'SELECT':
      return variable.values[0] ?? ''
    case 'TEMPORAL':
      return NOW
    default:
      return 'Ada'
  }
}

/** §8's log, newest first. A revert writes a new revision rather than rewriting one. */
function History({ locale, revisions, events, approved, onRestore, busy }: {
  locale: string
  revisions: Revision[]
  events: Detail['events']
  approved: number | null
  onRestore: (id: number) => void
  busy: boolean
}) {
  const actions = new Map(events.map((e) => [e.revisionId, e.action]))
  if (!revisions.length) return null
  return (
    <details className="group border-foreground mt-6 border-t pt-6">
      <summary className="font-heading flex w-fit cursor-pointer list-none items-baseline gap-2 text-xl font-bold tracking-[-0.03em] select-none [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block w-4 transition-transform group-open:rotate-45">+</span>
        History <span className="text-muted-foreground font-sans text-base font-medium tracking-normal">{revisions.length} {revisions.length === 1 ? 'revision' : 'revisions'}</span>
      </summary>
      <ul className="mt-5 grid gap-3" style={ink(locale)}>
        {[...revisions].reverse().map((r) => (
          <li key={r.id} className="grid gap-2 rounded-2xl border px-5 py-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge className="capitalize">{(actions.get(r.id) ?? 'edit').toLowerCase()}</Badge>
              {r.machine && <Badge>API key</Badge>}
              {r.id === approved && <Badge dot="bg-emerald-500" className="bg-primary text-primary-foreground">Live</Badge>}
              <span className="text-muted-foreground ml-auto">{day.format(new Date(r.createdAt))}</span>
              {r.id !== approved && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRestore(r.id)}>
                  Restore
                </Button>
              )}
            </div>
            <pre className="line-clamp-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
              <Highlight source={r.payload.pattern} />
            </pre>
          </li>
        ))}
      </ul>
    </details>
  )
}
