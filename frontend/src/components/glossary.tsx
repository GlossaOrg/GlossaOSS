import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Select } from '@/components/kit'
import { Flag, languageName } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useProject } from '@/lib/projects'
import { useLocale } from '@/lib/content'

export type Term = { id: number; term: string; locale: string | null; translation: string | null }

/** §6: the project's terms, for one locale or every locale; `locale` narrows to what binds it. */
export function useGlossary(projectId: number, locale?: string) {
  return useQuery({
    queryKey: ['glossary', projectId, locale ?? null],
    queryFn: () => api<Term[]>(`/api/projects/${projectId}/glossary${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`),
    enabled: !!projectId,
  })
}

/** §6's glossary: what a term must become in a language, or that it must never be translated. */
export function Glossary() {
  const project = useProject().project!
  const terms = useGlossary(project.id)
  const [adding, setAdding] = useState(false)
  const sorted = [...(terms.data ?? [])].sort((a, b) => a.term.localeCompare(b.term) || (a.locale ?? '').localeCompare(b.locale ?? ''))

  return (
    <div className="page">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h2>Glossary</h2>
          <p className="text-muted-foreground mt-1.5 max-w-[52ch] text-[0.9375rem] text-pretty">
            Terms every translation should agree on. Translators see the ones a message uses, and AI suggestions follow them.
          </p>
        </div>
        <Button onClick={() => setAdding(true)} disabled={adding}>
          <PlusIcon />
          Add a term
        </Button>
      </header>

      {adding && <Adder projectId={project.id} onDone={() => setAdding(false)} />}

      {terms.error ? (
        <p role="alert" className="text-destructive">Could not load the glossary. Reload the page.</p>
      ) : !terms.data ? (
        <div className="card grid gap-3 p-5" aria-busy>
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-6" style={{ opacity: 1 - i * 0.3 }} />)}
        </div>
      ) : !sorted.length ? (
        !adding && <p className="card text-muted-foreground p-6">No terms yet. Add the product names to keep as they are, and the words that must always read the same.</p>
      ) : (
        <ul className="card divide-y px-5">
          {sorted.map((t) => (
            <li key={t.id} className="reveal">
              <Row term={t} projectId={project.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const columns = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 py-3.5 md:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)_2.5rem]'

function Row({ term, projectId }: { term: Term; projectId: number }) {
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: () => api(`/api/projects/${projectId}/glossary/${term.id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['glossary', projectId] }),
  })
  return (
    <div className={`group/row ${columns}`}>
      <span className="truncate font-semibold">{term.term}</span>
      <span className="text-muted-foreground flex items-center gap-2 text-sm md:order-none">
        {term.locale ? <><Flag locale={term.locale} className="size-4" />{languageName(term.locale)}</> : 'Every language'}
      </span>
      <span className="truncate text-sm">{term.translation ?? <span className="text-muted-foreground">Kept as it is</span>}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${term.term}`}
        disabled={remove.isPending}
        onClick={() => remove.mutate()}
        className="text-muted-foreground hover:text-destructive justify-self-end transition-opacity md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100"
      >
        <Trash2Icon />
      </Button>
    </div>
  )
}

function Adder({ projectId, onDone }: { projectId: number; onDone: () => void }) {
  const client = useQueryClient()
  const { rows } = useLocale(projectId)
  const [term, setTerm] = useState('')
  const [locale, setLocale] = useState('')
  const [translation, setTranslation] = useState('')
  const save = useMutation({
    mutationFn: () => api(`/api/projects/${projectId}/glossary`, { method: 'PUT', json: { term: term.trim(), locale: locale || null, translation: translation.trim() || null } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['glossary', projectId] }).then(onDone),
  })

  return (
    <form
      className="card mb-3 grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)_auto] md:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        if (term.trim()) save.mutate()
      }}
    >
      <label className="grid gap-1.5">
        <span className="eyebrow">Term</span>
        <Input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Glossa" />
      </label>
      <label className="grid gap-1.5">
        <span className="eyebrow">In</span>
        <Select value={locale} onChange={(e) => setLocale(e.target.value)} lead={locale && <Flag locale={locale} className="size-4" />}>
          <option value="">Every language</option>
          {rows.filter((l) => !l.source).map((l) => <option key={l.locale} value={l.locale}>{languageName(l.locale)}</option>)}
        </Select>
      </label>
      <label className="grid gap-1.5">
        <span className="eyebrow">Becomes</span>
        <Input value={translation} onChange={(e) => setTranslation(e.target.value)} placeholder="Leave empty to keep it as it is" />
      </label>
      <span className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={!term.trim() || save.isPending}>Save</Button>
      </span>
      {save.error ? <p role="alert" className="text-destructive text-xs md:col-span-4">{(save.error as { detail?: string }).detail ?? 'Could not save.'}</p> : null}
    </form>
  )
}
