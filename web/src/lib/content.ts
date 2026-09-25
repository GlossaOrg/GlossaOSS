import { useQueries, useQuery } from '@tanstack/react-query'
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

/** Where a message stands in one locale. Colour belongs to languages, so a state is a dot. */
export const states: { value: Status; label: string; says: string; dot: string }[] = [
  { value: 'untranslated', label: 'To translate', says: 'Nothing written in this locale yet.', dot: 'bg-slate-400' },
  { value: 'review', label: 'In review', says: 'A proposal is waiting for a reviewer.', dot: 'bg-amber-500' },
  { value: 'rejected', label: 'Sent back', says: 'The last proposal was rejected.', dot: 'bg-rose-500' },
  { value: 'outdated', label: 'Source moved', says: 'The source changed after this was approved.', dot: 'bg-violet-500' },
  { value: 'approved', label: 'Approved', says: 'Live in the next catalog.', dot: 'bg-emerald-500' },
]

export const state = (s: Status) => states.find((x) => x.value === s)!

export type Kind = 'text' | 'brace' | 'name' | 'type' | 'style' | 'arm' | 'hash' | 'quote' | 'comma'
type Token = { text: string; kind: Kind; depth: number }
type Frame = { arg: false; plural: boolean } | { arg: true; part: number; choice: boolean; plural: boolean }

/**
 * ICU split into what each run of characters is, for colour only: the server parses for real and
 * reports what is wrong. It tolerates half-typed input, because that is all it ever sees.
 */
export function lex(src: string): Token[] {
  const out: Token[] = []
  const stack: Frame[] = [{ arg: false, plural: false }]
  const args = () => stack.filter((frame) => frame.arg).length
  const push = (text: string, kind: Kind, depth = args()) => {
    const last = out.at(-1)
    if (last && last.kind === kind && kind !== 'brace' && last.depth === depth) last.text += text
    else out.push({ text, kind, depth })
  }
  const close = () => {
    stack.pop()
    push('}', 'brace')
  }

  for (let i = 0; i < src.length; ) {
    const c = src[i]
    const top = stack.at(-1)!
    if (!top.arg) {
      if (c === "'" && src[i + 1] === "'") {
        push("''", 'quote')
        i += 2
      } else if (c === "'" && '{}#|'.includes(src[i + 1] ?? '')) {
        let j = i + 1
        while (j < src.length && src[j] !== "'") j++
        push(src.slice(i, j + 1), 'quote')
        i = j + 1
      } else if (c === '{') {
        push(c, 'brace')
        stack.push({ arg: true, part: 0, choice: false, plural: false })
        i++
      } else if (c === '}' && stack.length > 1) {
        stack.pop()
        push(c, 'brace')
        i++
      } else {
        push(c, c === '#' && top.plural ? 'hash' : 'text')
        i++
      }
      continue
    }
    if (c === '}') {
      close()
      i++
    } else if (c === ',' && top.part < 2) {
      push(c, 'comma')
      top.part++
      i++
    } else if (/\s/.test(c)) {
      push(c, 'text')
      i++
    } else if (top.part === 0) {
      push(c, 'name')
      i++
    } else if (top.part === 1) {
      const word = /^[a-z]+/.exec(src.slice(i))?.[0] ?? c
      top.choice = word === 'plural' || word === 'select' || word === 'selectordinal'
      top.plural = word === 'plural' || word === 'selectordinal'
      push(word, 'type')
      i += word.length
    } else if (!top.choice) {
      push(c, 'style')
      i++
    } else if (c === '{') {
      push(c, 'brace')
      stack.push({ arg: false, plural: top.plural })
      i++
    } else {
      const word = /^(offset:\s*\d+|=\d+(\.\d+)?|[^\s{}]+)/.exec(src.slice(i))![0]
      push(word, word.startsWith('offset') ? 'type' : 'arm')
      i += word.length
    }
  }
  return out
}

/** CLDR's own order, the one a reader counts in, instead of the alphabetical one the server sends. */
export const counting = (forms: Record<string, string[]>) => ['zero', 'one', 'two', 'few', 'many', 'other'].filter((form) => form in forms)

export type Analysis = { contract: Contract; missing: string[]; payload: Payload; rtl: boolean }

export type Release = { version: number; locale: string; hash: string; createdAt: string }

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
    enabled: !!projectId,
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

/**
 * Every locale's list at once, archived resources left out: what a screen needs to say how far each
 * language has got. It shares `useResources`' cache, so switching to a locale afterwards is instant.
 * ponytail: one list per locale. Batch it server-side when a project holds thousands of keys and
 * this becomes N large responses.
 */
export function useLocaleLists(projectId: number, locales: Locale[]) {
  return useQueries({
    queries: locales.map((l) => ({
      queryKey: ['resources', projectId, l.locale],
      queryFn: () => api<Resource[]>(`/api/projects/${projectId}/resources?locale=${encodeURIComponent(l.locale)}`),
      select: (rows: Resource[]) => rows.filter((r) => !r.archived),
    })),
  })
}
