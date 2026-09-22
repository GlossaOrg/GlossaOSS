import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeftIcon, CheckIcon, PlayIcon, Trash2Icon, UndoIcon, XIcon } from 'lucide-react'
import { cn } from 'cn'
import { Highlight, IcuEditor } from '@/components/icu-editor'
import { Flag } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Splash } from '@/components/splash'
import { api } from '@/lib/api'
import { covers, useProject, type Project } from '@/lib/projects'
import {
  day, state, status, typeTint, useDetail, useLocale,
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
  const archive = useMutation({
    mutationFn: (archived: boolean) => api(`/api/projects/${project.id}/resources/${resource.id}/archive`, { method: 'PUT', json: { archived } }),
    onSuccess: settled,
  })

  const s = state(status(resource))
  const dirty = pattern !== stored

  return (
    <div className="page flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <BackLink />
          <h2 className="mb-2 font-mono text-2xl break-all">{resource.key}</h2>
          {resource.context && <p className="text-muted-foreground max-w-2xl text-[17px]">{resource.context}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', s.tint)}>{s.label}</span>
          {manager && (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => archive.mutate(!resource.archived)}>
              <Trash2Icon />
              {resource.archived ? 'Restore' : 'Archive'}
            </Button>
          )}
        </div>
      </header>

      <IcuEditor
        role={origin ? 'Source' : 'Translation'}
        reference={origin ? undefined : { locale: source, pattern: sourceRevision.payload.pattern }}
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
            <div className="border-destructive/40 bg-destructive/5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3 text-sm">
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
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm dark:border-amber-400/30 dark:bg-amber-400/10">
          <p className="mb-2 font-medium">
            A proposal is waiting{head?.machine ? ' from an API key' : ''}. {reviewer ? 'Nothing else can be written until it is decided.' : 'A reviewer decides next.'}
          </p>
          {reviewer && (
            <div className="flex gap-2">
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
                <CheckIcon />
                Approve
              </Button>
              <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
                <XIcon />
                Send back
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!!check.problem || save.isPending || pending || !dirty || (origin && !manager)} onClick={() => save.mutate()}>
          {reviewer ? 'Save' : 'Propose'}
        </Button>
        {dirty && <Button variant="ghost" onClick={() => setPattern(stored)}>Discard</Button>}
        {origin && !manager && <span className="text-muted-foreground text-sm">Only a manager edits the source.</span>}
        {!reviewer && !origin && <span className="text-muted-foreground text-sm">Saved as a proposal for review.</span>}
      </div>

      <History
        revisions={revisions.filter((r) => r.locale === target)}
        events={events}
        approved={resource.approvedRevisionId}
        onRestore={(id) => restore.mutate(id)}
        busy={restore.isPending}
      />
    </div>
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

      <div className="flex flex-wrap gap-4">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Key</span>
          <Input value={key} onChange={(e) => setKey(e.target.value)} autoFocus maxLength={255} placeholder="checkout.items" className="bg-background w-72 font-mono text-[13px]" />
        </label>
        <label className="grid min-w-60 flex-1 gap-1.5">
          <span className="text-sm font-medium">
            Context <span className="text-muted-foreground font-normal">(optional)</span>
          </span>
          <Input value={context} onChange={(e) => setContext(e.target.value)} maxLength={255} placeholder="What a translator needs to know" className="bg-background" />
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
        <Button disabled={!key.trim() || !!check.problem || create.isPending} onClick={() => create.mutate()}>
          Create message
        </Button>
        <Button variant="ghost" onClick={() => navigate('/content')}>Cancel</Button>
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
      className="text-muted-foreground hover:text-foreground mb-3 inline-flex cursor-pointer items-center gap-1.5 text-sm transition-colors"
    >
      <ArrowLeftIcon className="size-3.5" />
      All content
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
    <section className="bg-background rounded-xl border">
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        <PlayIcon className="text-brand size-3.5" />
        <span className="text-sm font-medium">Try it</span>
        {entries.length > 0 && <span className="text-muted-foreground text-xs">{entries.length} {entries.length === 1 ? 'variable' : 'variables'}</span>}
      </header>

      {entries.length > 0 && (
        <div className="grid gap-x-8 gap-y-3 border-b px-4 py-4 md:grid-cols-2">
          {entries.map(([name, variable]) => (
            <Value key={name} name={name} variable={variable} value={filled[name]} onChange={(v) => onValues({ ...values, [name]: v })} />
          ))}
        </div>
      )}

      <div className="grid gap-2 px-4 py-4">
        <Rendered label={locale.locale} text={ready ? shown.data?.text : undefined} rtl={locale.rtl} strong />
        {reference && <Rendered label={reference.locale.locale} text={original.data?.text} rtl={reference.locale.rtl} />}
      </div>
    </section>
  )
}

function Rendered({ label, text, rtl, strong }: { label: string; text?: string; rtl?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground flex w-20 shrink-0 items-center gap-1.5 font-mono text-xs">
        <Flag locale={label} className="size-4" />
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
          className={cn('min-w-0 [overflow-wrap:anywhere]', strong ? 'text-[17px] font-medium' : 'text-muted-foreground', !text && 'text-muted-foreground/50')}
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
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-[13px]">{name}</span>
        <span className={cn('rounded px-1.5 text-[10px] font-medium', typeTint[variable.type])}>{variable.type.toLowerCase()}</span>
      </span>
      {variable.type === 'NUMBER' ? (
        <span className="flex items-center gap-3">
          <input type="range" min={0} max={30} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} className="accent-brand h-1 flex-1 cursor-pointer" />
          <Input type="number" value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} className="bg-background w-24" />
        </span>
      ) : variable.type === 'BOOLEAN' ? (
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="accent-brand size-4 cursor-pointer" />
      ) : variable.type === 'SELECT' ? (
        <span className="flex flex-wrap gap-1">
          {variable.values.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={cn(
                'cursor-pointer rounded-full px-2.5 py-0.5 text-xs font-medium transition-transform duration-200 motion-safe:active:scale-95',
                value === option ? 'bg-foreground text-background' : 'bg-muted hover:bg-accent',
              )}
            >
              {option}
            </button>
          ))}
        </span>
      ) : variable.type === 'TEMPORAL' ? (
        <Input type="datetime-local" value={String(value).slice(0, 16)} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : NOW)} className="bg-background" />
      ) : (
        <Input value={String(value)} onChange={(e) => onChange(e.target.value)} className="bg-background" />
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
function History({ revisions, events, approved, onRestore, busy }: {
  revisions: Revision[]
  events: Detail['events']
  approved: number | null
  onRestore: (id: number) => void
  busy: boolean
}) {
  const actions = new Map(events.map((e) => [e.revisionId, e.action]))
  if (!revisions.length) return null
  return (
    <details className="group">
      <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-sm transition-colors select-none">
        History · {revisions.length} {revisions.length === 1 ? 'revision' : 'revisions'}
      </summary>
      <ul className="mt-3 grid gap-3">
        {[...revisions].reverse().map((r) => (
          <li key={r.id} className="bg-background grid gap-1.5 rounded-lg border px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground text-[10px] uppercase">{actions.get(r.id) ?? 'edit'}</span>
              {r.machine && <span className="rounded bg-sky-100 px-1 text-[10px] font-medium text-sky-900 dark:bg-sky-400/15 dark:text-sky-100">API key</span>}
              {r.id === approved && <span className="text-brand text-[10px] font-semibold uppercase">live</span>}
              <span className="text-muted-foreground ml-auto">{day.format(new Date(r.createdAt))}</span>
              {r.id !== approved && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRestore(r.id)}
                  className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <UndoIcon className="size-3" />
                  Restore
                </button>
              )}
            </div>
            <pre className="line-clamp-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              <Highlight source={r.payload.pattern} />
            </pre>
          </li>
        ))}
      </ul>
    </details>
  )
}
