import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useWorkspace } from '@/store/workspace'

/** §3's typed argument a message may use. Only a SELECT declares `values`. */
export type VariableType = 'TEXT' | 'NUMBER' | 'TEMPORAL' | 'SELECT' | 'BOOLEAN'
export type Variable = { type: VariableType; values: string[] }
export type Contract = Record<string, Variable>
export type Payload = { pattern: string }

/** `cardinal` and `ordinal` map each CLDR category this locale needs to its sample numbers. */
export type Locale = {
  locale: string
  source: boolean
  fallbackLocale: string | null
  rtl: boolean
  cardinal: Record<string, string[]>
  ordinal: Record<string, string[]>
}

export type Resource = {
  id: number
  key: string
  context: string | null
  fieldType: string
  archived: boolean
  sourceRevisionId: number
  headRevisionId: number | null
  approvedRevisionId: number | null
  pendingRevisionId: number | null
  stale: boolean
  sourcePayload: Payload
  payload: Payload | null
}

export type Revision = {
  id: number
  locale: string
  basedOnSourceRevisionId: number | null
  payload: Payload
  contract: Contract
  actor: string
  machine: boolean
  createdAt: string
}

export type Event = { id: number; revisionId: number | null; action: string; actor: string; createdAt: string }
export type Detail = { resource: Resource; revisions: Revision[]; events: Event[] }

/**
 * §3: a payload as the tree an editor works on. The field type owns the syntax in both directions,
 * so nothing here ever reads or writes ICU.
 */
/** The four revision ids and `stale` say everything about a locale's state; nothing else has to be asked for. */
export type Status = 'untranslated' | 'review' | 'rejected' | 'outdated' | 'approved'

export function status(r: Resource): Status {
  if (r.pendingRevisionId) return 'review'
  if (r.headRevisionId == null) return 'untranslated'
  if (r.headRevisionId !== r.approvedRevisionId) return 'rejected'
  return r.stale ? 'outdated' : 'approved'
}

/** Sticky-note tints, in the vocabulary `lib/projects.ts` already uses for roles. */
export const states: { value: Status; label: string; says: string; tint: string; dot: string }[] = [
  { value: 'untranslated', label: 'To translate', says: 'Nothing written in this locale yet.', tint: 'bg-slate-100 text-slate-800 dark:bg-slate-400/15 dark:text-slate-100', dot: 'bg-slate-400' },
  { value: 'review', label: 'In review', says: 'A proposal is waiting for a reviewer.', tint: 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100', dot: 'bg-amber-500' },
  { value: 'rejected', label: 'Sent back', says: 'The last proposal was rejected.', tint: 'bg-rose-100 text-rose-900 dark:bg-rose-400/15 dark:text-rose-100', dot: 'bg-rose-500' },
  { value: 'outdated', label: 'Source moved', says: 'The source changed after this was approved.', tint: 'bg-violet-100 text-violet-900 dark:bg-violet-400/15 dark:text-violet-100', dot: 'bg-violet-500' },
  { value: 'approved', label: 'Approved', says: 'Live in the next catalog.', tint: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-100', dot: 'bg-emerald-500' },
]

export const state = (s: Status) => states.find((x) => x.value === s)!

export const typeTint: Record<VariableType, string> = {
  TEXT: 'bg-slate-100 text-slate-800 dark:bg-slate-400/20 dark:text-slate-100',
  NUMBER: 'bg-sky-100 text-sky-900 dark:bg-sky-400/20 dark:text-sky-100',
  TEMPORAL: 'bg-violet-100 text-violet-900 dark:bg-violet-400/20 dark:text-violet-100',
  SELECT: 'bg-rose-100 text-rose-900 dark:bg-rose-400/20 dark:text-rose-100',
  BOOLEAN: 'bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100',
}

export type Segment = { text: string; argument?: string; kind?: string }

/**
 * A pattern split into literal text and its top-level arguments, for the read-only previews the
 * board shows. Editing never comes near here: the tree does that.
 *
 * ponytail: brace depth only, so a quoted '{' inside a literal reads as an argument. Cosmetic.
 */
export function segments(pattern: string): Segment[] {
  const out: Segment[] = []
  let literal = ''
  let argument = ''
  let depth = 0
  for (const c of pattern) {
    if (c === '{') {
      if (depth === 0) {
        if (literal) out.push({ text: literal })
        literal = ''
        argument = ''
      } else argument += c
      depth++
    } else if (c === '}' && depth > 0) {
      depth--
      if (depth === 0) {
        const [name, kind] = argument.split(',', 2).map((part) => part.trim())
        out.push({ text: name, argument: name, kind })
      } else argument += c
    } else if (depth === 0) literal += c
    else argument += c
  }
  if (literal) out.push({ text: literal })
  return out
}

export type Node =
  | { node: 'text'; value: string }
  | { node: 'hole'; argument: string; format: string | null; style: string | null }
  | { node: 'choice'; argument: string; kind: 'PLURAL' | 'SELECTORDINAL' | 'SELECT'; offset: number; branches: Branch[] }

export type Branch = { match: string; body: Node[] }

/** CLDR's own order, the one a reader counts in, instead of the alphabetical one the server sends. */
export const counting = (forms: Record<string, string[]>) => ['zero', 'one', 'two', 'few', 'many', 'other'].filter((form) => form in forms)

export type Analysis = { contract: Contract; structure: Node[]; payload: Payload; rtl: boolean }

export type Release = { version: number; locale: string; hash: string; createdAt: string }

export type Choice = Extract<Node, { node: 'choice' }>

/** Where a sub-message lives: which node of a list, then which arm of the choice there. */
export type Step = { node: number; branch: number }

/** One CLDR form a choice in the tree is still missing, and where it would be added. */
export type Gap = { argument: string; form: string; at: number; path: Step[]; conditions: Record<string, string> }

/** The forms this locale still needs, per choice in the tree, with the arm each one would join. */
export function gaps(nodes: Node[], locale: Locale, prefix: Step[] = [], conditions: Record<string, string> = {}): Gap[] {
  return nodes.flatMap((node, index) =>
    node.node !== 'choice'
      ? []
      : [
          ...(node.kind === 'SELECT'
            ? []
            : Object.keys(node.kind === 'PLURAL' ? locale.cardinal : locale.ordinal)
                .filter((form) => !node.branches.some((branch) => branch.match === form))
                .map((form) => ({ argument: node.argument, form, at: index, path: prefix, conditions }))),
          ...node.branches.flatMap((branch, branchIndex) =>
            gaps(branch.body, locale, [...prefix, { node: index, branch: branchIndex }], { ...conditions, [node.argument]: branch.match }),
          ),
        ],
  )
}

export const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * The project's locales. A caller whose role is scoped to one locale has to name it, and the
 * workspace remembers which — ponytail: that caller's very first load has nothing to send and is
 * refused, until `/api/projects` carries the locale a grant is scoped to.
 */
export function useLocales(projectId: number) {
  const stored = useWorkspace((s) => s.locale)
  return useQuery({
    queryKey: ['locales', projectId],
    queryFn: () => api<Locale[]>(`/api/projects/${projectId}/locales${stored ? `?locale=${encodeURIComponent(stored)}` : ''}`),
  })
}

/** The locale every content screen is on: the remembered one while it is still enabled, the source otherwise. */
export function useLocale(projectId: number) {
  const locales = useLocales(projectId)
  const select = useWorkspace((s) => s.select)
  const remembered = useWorkspace((s) => s.locale)
  const rows = locales.data ?? []
  const source = rows.find((l) => l.source)
  return {
    locales,
    rows,
    source,
    locale: rows.find((l) => l.locale === remembered) ?? source,
    select: (locale: string) => select(projectId, locale),
  }
}

export function useResources(projectId: number, locale?: string) {
  return useQuery({
    queryKey: ['resources', projectId, locale],
    queryFn: () => api<Resource[]>(`/api/projects/${projectId}/resources?locale=${encodeURIComponent(locale!)}`),
    enabled: !!locale,
  })
}

export function useDetail(projectId: number, id: number, locale?: string) {
  return useQuery({
    queryKey: ['resource', projectId, id, locale],
    queryFn: () => api<Detail>(`/api/projects/${projectId}/resources/${id}?locale=${encodeURIComponent(locale!)}`),
    enabled: !!locale,
  })
}
