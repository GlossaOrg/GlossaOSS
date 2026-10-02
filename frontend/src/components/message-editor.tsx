import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate, useParams } from 'react-router'
import { ArchiveIcon, CalendarIcon, PencilLineIcon, PlusIcon } from 'lucide-react'
import { cn } from 'cn'
import { Highlight, IcuEditor } from '@/components/icu-editor'
import { Badge } from '@/components/kit'
import { Calendar } from '@/components/ui/calendar'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/sonner'
import { useGlossary } from '@/components/glossary'
import { Flag, LocaleSelect } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Splash } from '@/components/splash'
import { api } from '@/lib/api'
import { covers, useProject, type Project } from '@/lib/projects'
import {
  day, readable, state, status, useDetail, useLocale, useProgress,
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
  const [confirmArchive, setConfirmArchive] = useState(false)
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
    onSuccess: () => {
      setConfirmArchive(false)
      return settled()
    },
  })

  const resourceStatus = status(resource)
  const s = state(resourceStatus)
  const dirty = pattern !== stored
  const canSave = !check.problem && !save.isPending && !pending && dirty && !(origin && !manager)

  return (
    <div className="page flex flex-col gap-3">
      <header className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h2 className="min-w-0 font-mono text-xl font-semibold tracking-[-0.02em] break-all">{resource.key}</h2>
            {resourceStatus !== 'untranslated' && <Badge className={s.tint}>{s.label}</Badge>}
          </div>
          <Context projectId={project.id} resourceId={resource.id} context={resource.context} manager={manager} onSaved={settled} />
        </div>
        <LocaleSwitch project={project} locale={locale} dirty={dirty} />
      </header>

      {/* Wide enough, the thread and the log stand beside the editor instead of under it. */}
      <div className="grid gap-3 @6xl/main:grid-cols-[minmax(0,1fr)_23rem] @6xl/main:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          {!origin && <Terms projectId={project.id} locale={target} source={sourceRevision.payload.pattern} written={pattern} />}

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
                <div className="border-destructive/30 bg-destructive/5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border py-3 pr-3 pl-4 text-sm">
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
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-xl bg-amber-100/70 p-4 dark:bg-amber-400/10">
              <p className="min-w-60 flex-1">
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
            </motion.div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!canSave} onClick={() => save.mutate()}>
              {reviewer ? 'Save' : 'Propose'}
            </Button>
            {dirty && <Button variant="ghost" onClick={() => setPattern(stored)}>Discard</Button>}
            {manager && (
              <Button
                variant={resource.archived ? 'outline' : 'destructive'}
                className={cn('ml-auto', !resource.archived && 'border-destructive/30')}
                disabled={archive.isPending}
                onClick={() => resource.archived ? archive.mutate(false) : setConfirmArchive(true)}
              >
                <ArchiveIcon />
                {resource.archived ? 'Restore' : 'Archive'}
              </Button>
            )}
            {origin && !manager && <span className="text-muted-foreground text-sm">Only a manager edits the source.</span>}
            {!reviewer && !origin && <span className="text-muted-foreground text-sm">Saved as a proposal for review.</span>}
          </div>

          <ConfirmDialog
            open={confirmArchive}
            onOpenChange={setConfirmArchive}
            title="Archive this message?"
            description={<>{resource.key} will disappear from translation work and future releases. You can restore it later.</>}
            action="Archive message"
            pendingLabel="Archiving…"
            pending={archive.isPending}
            icon={<ArchiveIcon />}
            error={(archive.error as { detail?: string } | null)?.detail}
            onConfirm={() => archive.mutate(true)}
          />
        </div>

        <Side
          projectId={project.id}
          resourceId={resource.id}
          locale={target}
          canWrite={covers(project.role, 'TRANSLATOR')}
          revisions={revisions.filter((r) => r.locale === target)}
          events={events}
          approved={resource.approvedRevisionId}
          onRestore={(id) => restore.mutate(id)}
          busy={restore.isPending}
        />
      </div>
    </div>
  )
}

/**
 * Everything said *about* the message rather than written *in* it: the thread and the log, one at a
 * time in a column of their own. Two collapsed cards under the editor is how both went unread.
 */
function Side({ projectId, resourceId, locale, canWrite, revisions, events, approved, onRestore, busy }: {
  projectId: number
  resourceId: number
  locale: string
  canWrite: boolean
  revisions: Revision[]
  events: Detail['events']
  approved: number | null
  onRestore: (id: number) => void
  busy: boolean
}) {
  return (
    <aside className="card flex min-w-0 flex-col px-4 py-2 @6xl/main:sticky @6xl/main:top-20 @6xl/main:max-h-[calc(100svh-7rem)]">
      <Tabs defaultValue="comments" className="min-h-0 flex-1">
        <TabsList variant="line" className="shrink-0 border-b">
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="comments" className="min-h-0 flex-1 overflow-y-auto pt-2 pb-1">
          <Comments projectId={projectId} resourceId={resourceId} locale={locale} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto pt-2 pb-1">
          <History revisions={revisions} events={events} approved={approved} onRestore={onRestore} busy={busy} />
        </TabsContent>
      </Tabs>
    </aside>
  )
}

/** The language being edited, switchable in place: the editor remounts on the other locale's revisions. */
function LocaleSwitch({ project, locale, dirty }: { project: Project; locale: Locale; dirty: boolean }) {
  const { rows, select } = useLocale(project.id)
  const progress = useProgress(project.id)
  const options = readable(rows, progress.data)
  if (options.length < 2) return null
  return (
    <span title={dirty ? 'Save or discard your change first.' : undefined}>
      <LocaleSelect value={locale.locale} options={options} disabled={dirty} onChange={(next) => next && select(next)} />
    </span>
  )
}

/** What a translator is told about the message; the manager edits it in place, and it has no history. */
function Context({ projectId, resourceId, context, manager, onSaved }: { projectId: number; resourceId: number; context: string | null; manager: boolean; onSaved: () => Promise<unknown> }) {
  const [draft, setDraft] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => api(`/api/projects/${projectId}/resources/${resourceId}/context`, { method: 'PUT', json: { context: draft } }),
    onSuccess: () => onSaved().then(() => setDraft(null)),
  })
  if (draft !== null)
    return (
      <form
        className="mt-2 flex w-full flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus maxLength={255} placeholder="What a translator needs to know" className="max-w-[72ch] min-w-60 flex-1" />
        <Button type="submit" size="sm" disabled={save.isPending}>Save</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
      </form>
    )
  if (!context && !manager) return null
  return (
    <div className="mt-2 flex max-w-[72ch] items-center gap-1">
      {context ? (
        <>
          <p className="text-muted-foreground min-w-0 text-sm leading-relaxed">{context}</p>
          {manager && (
            <Button type="button" size="icon-xs" variant="ghost" aria-label="Edit description" title="Edit description" onClick={() => setDraft(context)}>
              <PencilLineIcon />
            </Button>
          )}
        </>
      ) : manager ? (
        <Button type="button" size="sm" variant="ghost" className="text-muted-foreground -ml-3" onClick={() => setDraft('')}>
          <PlusIcon />
          Add description
        </Button>
      ) : null}
    </div>
  )
}

type Comment = { id: number; author: string; body: string; createdAt: string }

/** The thread about this message in this language: a translator's question, the manager's answer. */
function Comments({ projectId, resourceId, locale, canWrite }: { projectId: number; resourceId: number; locale: string; canWrite: boolean }) {
  const client = useQueryClient()
  const key = ['comments', projectId, resourceId, locale]
  const path = `/api/projects/${projectId}/resources/${resourceId}/comments?locale=${encodeURIComponent(locale)}`
  const thread = useQuery({ queryKey: key, queryFn: () => api<Comment[]>(path) })
  const [body, setBody] = useState('')
  const post = useMutation({
    mutationFn: () => api(path, { method: 'POST', json: { body } }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }).then(() => setBody('')),
  })
  const comments = thread.data ?? []
  const send = () => body.trim() && !post.isPending && post.mutate()
  return (
    <div className="grid gap-2">
      {comments.length > 0 ? (
        <ul className="divide-y">
          {comments.map((c) => (
            <li key={c.id} className="py-3 first:pt-0">
              <p className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                <span className="text-foreground font-medium">{c.author}</span>
                {day.format(new Date(c.createdAt))}
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Nothing asked about this message yet.</p>
      )}
      {canWrite && (
        <div className="grid gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              // ⌘↵ posts without reaching for the button.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                send()
              }
            }}
            maxLength={2000}
            placeholder="Ask or answer something about this message"
            className="border-input bg-card focus-visible:ring-ring/10 max-h-40 min-h-14 resize-y rounded-lg [field-sizing:content] border px-3 py-2 text-sm outline-none focus-visible:ring-3"
          />
          {post.error ? <p role="alert" className="text-destructive text-xs">{(post.error as { detail?: string }).detail ?? 'Could not post the comment.'}</p> : null}
          <Button size="sm" className="w-fit" disabled={!body.trim() || post.isPending} onClick={send}>Comment</Button>
        </div>
      )}
    </div>
  )
}

/** §6: the glossary's terms this source uses, and whether the translation so far honours each. */
function Terms({ projectId, locale, source, written }: { projectId: number; locale: string; source: string; written: string }) {
  const terms = useGlossary(projectId, locale).data ?? []
  const has = (text: string, word: string) => new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu').test(text)
  // A locale's own entry wins over the one for every language.
  const used = terms
    .filter((t) => has(source, t.term))
    .filter((t, _, all) => t.locale === locale || !all.some((o) => o.locale === locale && o.term.toLowerCase() === t.term.toLowerCase()))
  if (!used.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 text-sm">
      <span className="eyebrow mr-1">Glossary</span>
      {used.map((t) => {
        const expected = t.translation ?? t.term
        const honoured = !written.trim() || has(written, expected)
        return (
          <span key={t.id} title={honoured ? undefined : `The translation does not use “${expected}” yet.`}>
            <Badge className={cn('bg-card', !honoured && 'text-destructive')}>
              {t.term} → {t.translation ?? <i className="font-normal">keep as is</i>}
            </Badge>
          </span>
        )
      })}
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
    <div className="page flex flex-col gap-3">
      <h2>New message</h2>

      <div className="card flex flex-wrap gap-4 p-4">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Key</span>
          <Input value={key} onChange={(e) => setKey(e.target.value)} autoFocus maxLength={255} placeholder="checkout.items" className="w-72 font-mono text-sm" />
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
    <section className="card">
      <header className="px-5 pt-4">
        <h3>Try it</h3>
      </header>

      {entries.length > 0 && (
        <div className="grid gap-x-8 gap-y-4 px-5 pt-4 md:grid-cols-2">
          {entries.map(([name, variable]) => (
            <Value key={name} name={name} variable={variable} value={filled[name]} onChange={(v) => onValues({ ...values, [name]: v })} />
          ))}
        </div>
      )}

      <div className="grid gap-3 px-5 pt-5 pb-5">
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
        <Flag locale={label} className="size-3.5" />
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
          className={cn('min-w-0 [overflow-wrap:anywhere]', strong ? 'font-heading text-2xl leading-tight font-bold tracking-[-0.025em]' : 'text-muted-foreground text-sm', !text && 'text-muted-foreground/50')}
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
        <span className="font-mono text-xs font-semibold">{name}</span>
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
                'h-8 cursor-pointer rounded-md border px-3 text-sm font-medium transition-colors motion-safe:active:scale-95',
                value === option ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:border-foreground/40',
              )}
            >
              {option}
            </button>
          ))}
        </span>
      ) : variable.type === 'TEMPORAL' ? (
        <DateTimePicker value={String(value)} onChange={onChange} />
      ) : (
        <Input value={String(value)} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

function DateTimePicker({ value, onChange }: { value: string; onChange: (value: unknown) => void }) {
  const [open, setOpen] = useState(false)
  const parsed = new Date(value)
  const date = Number.isNaN(parsed.getTime()) ? new Date(NOW) : parsed
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  const update = (next: Date) => onChange(next.toISOString())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" className="w-full justify-start font-normal" />}>
        <CalendarIcon className="text-muted-foreground" />
        {date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(selected) => {
            if (!selected) return
            const next = new Date(selected)
            next.setHours(date.getHours(), date.getMinutes(), 0, 0)
            update(next)
          }}
        />
        <div className="flex items-end gap-2 border-t p-3">
          <label className="grid flex-1 gap-1 text-xs font-medium">
            Time
            <Input
              type="time"
              value={time}
              onChange={(event) => {
                if (!event.target.value) return
                const [hours, minutes] = event.target.value.split(':').map(Number)
                const next = new Date(date)
                next.setHours(hours, minutes, 0, 0)
                update(next)
              }}
            />
          </label>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>Done</Button>
        </div>
      </PopoverContent>
    </Popover>
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
  if (!revisions.length) return <p className="text-muted-foreground text-sm">Nothing written in this language yet.</p>
  return (
      <ul className="divide-y">
        {[...revisions].reverse().map((r) => (
          <li key={r.id} className="grid gap-2 py-3.5 first:pt-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge className="capitalize">{(actions.get(r.id) ?? 'edit').toLowerCase()}</Badge>
              {r.machine && <Badge>API key</Badge>}
              {r.id === approved && <Badge className="bg-foreground text-background">Live</Badge>}
              <span className="text-muted-foreground ml-auto">{day.format(new Date(r.createdAt))}</span>
              {r.id !== approved && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRestore(r.id)}>
                  Restore
                </Button>
              )}
            </div>
            <pre className="line-clamp-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              <Highlight source={r.payload.pattern} />
            </pre>
          </li>
        ))}
      </ul>
  )
}
