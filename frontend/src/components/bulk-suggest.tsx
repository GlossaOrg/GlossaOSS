import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SparklesIcon } from 'lucide-react'
import { cn } from 'cn'
import { languageName } from '@/components/locale'
import { Pattern } from '@/components/pattern'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { api } from '@/lib/api'
import type { Detail, Locale, Resource } from '@/lib/content'

type Draft = { resource: Resource; pattern?: string; failed?: string; keep: boolean; saved?: boolean }

/** ponytail: a cap on one batch, so one click never runs up an unbounded provider bill; raise it if teams ask. */
const LIMIT = 30
const PARALLEL = 3

/**
 * §9 for many messages at once: one suggestion per untranslated message, shown to whoever asked.
 * Nothing is written until they save, and each save is their own change through §8's workflow.
 */
export function BulkSuggest({ projectId, locale, source, rows, reviewer }: { projectId: number; locale: Locale; source: Locale; rows: Resource[]; reviewer: boolean }) {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [saving, setSaving] = useState(false)
  const run = useRef(0)
  const todo = rows.filter((r) => !r.archived && r.headRevisionId == null).slice(0, LIMIT)
  if (!todo.length) return null

  const patch = (id: number, change: Partial<Draft>) => setDrafts((all) => all.map((d) => (d.resource.id === id ? { ...d, ...change } : d)))

  const start = async () => {
    const mine = ++run.current
    setDrafts(todo.map((resource) => ({ resource, keep: false })))
    const queue = [...todo]
    const worker = async () => {
      for (let r = queue.shift(); r && run.current === mine; r = queue.shift()) {
        try {
          // The source revision's own contract: the suggestion has to keep exactly its arguments.
          const detail = await api<Detail>(`/api/projects/${projectId}/resources/${r.id}?locale=${encodeURIComponent(locale.locale)}`)
          const origin = detail.revisions.find((v) => v.id === r.sourceRevisionId)!
          const answer = await api<{ pattern: string }>(`/api/projects/${projectId}/messages/${encodeURIComponent(locale.locale)}/translate`, {
            method: 'POST',
            json: { payload: origin.payload, contract: origin.contract, context: r.context },
          })
          if (run.current === mine) patch(r.id, { pattern: answer.pattern, keep: true })
        } catch (error) {
          if (run.current === mine) patch(r.id, { failed: (error as { detail?: string }).detail ?? 'No suggestion.' })
        }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, worker))
  }

  const save = async () => {
    setSaving(true)
    for (const d of drafts.filter((d) => d.keep && d.pattern && !d.saved)) {
      try {
        await api(`/api/projects/${projectId}/resources/${d.resource.id}/variants/${encodeURIComponent(locale.locale)}`, {
          method: 'PUT',
          json: { expectedHeadRevisionId: d.resource.headRevisionId ?? 0, sourceRevisionId: d.resource.sourceRevisionId, payload: { pattern: d.pattern } },
        })
        patch(d.resource.id, { saved: true, keep: false })
      } catch (error) {
        patch(d.resource.id, { failed: (error as { detail?: string }).detail ?? 'Could not save.', keep: false })
      }
    }
    setSaving(false)
    await client.invalidateQueries({ queryKey: ['resources', projectId] })
  }

  const close = (next: boolean) => {
    setOpen(next)
    if (!next) {
      run.current++
      setDrafts([])
    }
  }

  const kept = drafts.filter((d) => d.keep && d.pattern && !d.saved).length
  const pending = drafts.filter((d) => !d.pattern && !d.failed).length
  const verb = reviewer ? 'Save' : 'Propose'

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <SparklesIcon />
        Suggest {todo.length} missing
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="flex max-h-[90svh] flex-col gap-5 p-7 sm:max-w-3xl">
          <DialogHeader className="text-left">
            <DialogTitle className="text-2xl">Suggestions in {languageName(locale.locale)}</DialogTitle>
            <DialogDescription>
              Nothing is saved until you {verb.toLowerCase()} it, and each one counts as your own change{reviewer ? '' : ', for a reviewer to decide'}.
            </DialogDescription>
          </DialogHeader>

          {!drafts.length ? (
            <div className="bg-secondary grid gap-4 rounded-lg p-5">
              <p>
                {todo.length === 1 ? 'One message has' : `${todo.length} messages have`} nothing written in {languageName(locale.locale)} yet
                {todo.length === LIMIT ? ' (at most this many per batch)' : ''}. Your provider charges for each suggestion.
              </p>
              <Button className="justify-self-start" onClick={start}>
                <SparklesIcon />
                Ask for {todo.length} {todo.length === 1 ? 'suggestion' : 'suggestions'}
              </Button>
            </div>
          ) : (
            <ul className="-mx-2 min-h-0 flex-1 divide-y overflow-y-auto px-2">
              {drafts.map((d) => (
                <li key={d.resource.id} className="grid gap-2 py-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Keep the suggestion for ${d.resource.key}`}
                      checked={d.keep}
                      disabled={!d.pattern || d.saved}
                      onChange={(e) => patch(d.resource.id, { keep: e.target.checked })}
                      className="accent-foreground mt-1 size-4 cursor-pointer"
                    />
                    <div className="grid min-w-0 flex-1 gap-1">
                      <span className="text-muted-foreground font-mono text-xs">{d.resource.key}</span>
                      <span className="text-sm"><Pattern text={d.resource.sourcePayload.pattern} rtl={source.rtl} locale={source.locale} /></span>
                      {d.saved ? (
                        <span className="text-sm text-emerald-700 dark:text-emerald-400">{reviewer ? 'Saved.' : 'Proposed.'}</span>
                      ) : d.failed ? (
                        <span className="text-destructive text-sm">{d.failed}</span>
                      ) : d.pattern === undefined ? (
                        <span className="text-muted-foreground flex items-center gap-2 text-sm"><Spinner /> Asking…</span>
                      ) : (
                        <textarea
                          dir={locale.rtl ? 'rtl' : undefined}
                          value={d.pattern}
                          onChange={(e) => patch(d.resource.id, { pattern: e.target.value, keep: true })}
                          className={cn('border-input bg-card focus-visible:ring-ring/10 max-h-40 min-h-9 w-full resize-y rounded-lg [field-sizing:content] border px-3 py-2 font-mono text-sm outline-none focus-visible:ring-3', !d.keep && 'opacity-60')}
                        />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {drafts.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted-foreground text-sm">{pending ? `${pending} still coming…` : `${kept} selected`}</span>
              <span className="flex gap-2">
                <Button variant="ghost" onClick={() => close(false)}>Close</Button>
                <Button disabled={!kept || saving} onClick={save}>
                  {saving && <Spinner />}
                  {verb} {kept}
                </Button>
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
