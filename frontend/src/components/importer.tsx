import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { UploadIcon } from 'lucide-react'
import { Flag, languageName } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { api } from '@/lib/api'
import type { Locale } from '@/lib/content'
import { parse } from '@/lib/files'

type Imported = { created: number; updated: number; unchanged: number; skipped: { key: string; reason: string }[] }

/** The server's own cap on one call; a bigger file goes in several. */
const CHUNK = 2000

/** Brings an existing file's messages into one locale, each entry an ordinary write (§8). */
export function Importer({ projectId, locale, reviewer }: { projectId: number; locale: Locale; reviewer: boolean }) {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<{ name: string; entries: Record<string, string> } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Imported | null>(null)
  const count = file ? Object.keys(file.entries).length : 0

  const read = async (picked?: File) => {
    setProblem(null)
    setResult(null)
    setFile(null)
    if (!picked) return
    try {
      const entries = parse(picked.name, await picked.text())
      if (!Object.keys(entries).length) setProblem('No messages found in that file.')
      else setFile({ name: picked.name, entries })
    } catch {
      setProblem('That file could not be read. JSON, .properties and .strings files are supported.')
    }
  }

  const send = async () => {
    if (!file) return
    setBusy(true)
    setProblem(null)
    const all = Object.entries(file.entries)
    const total: Imported = { created: 0, updated: 0, unchanged: 0, skipped: [] }
    try {
      for (let i = 0; i < all.length; i += CHUNK) {
        const part = await api<Imported>(`/api/projects/${projectId}/imports/${encodeURIComponent(locale.locale)}`, {
          method: 'POST',
          json: { entries: Object.fromEntries(all.slice(i, i + CHUNK)) },
        })
        total.created += part.created
        total.updated += part.updated
        total.unchanged += part.unchanged
        total.skipped.push(...part.skipped)
      }
      setResult(total)
      setFile(null)
    } catch (error) {
      setProblem((error as { detail?: string }).detail ?? 'The import failed.')
    } finally {
      setBusy(false)
      await client.invalidateQueries({ queryKey: ['resources', projectId] })
    }
  }

  const close = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setFile(null)
      setResult(null)
      setProblem(null)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UploadIcon />
        Import
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="grid gap-5 p-7 sm:max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Flag locale={locale.locale} className="size-6" />
              Import into {languageName(locale.locale)}
            </DialogTitle>
            <DialogDescription>
              {locale.source
                ? 'New keys become messages, and changed ones are updated.'
                : `Each line is written as your own change${reviewer ? '' : ', a proposal for a reviewer'}. Keys the source does not have are skipped.`}
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="grid gap-3 text-sm">
              <p className="font-semibold">
                {[result.created && `${result.created} created`, result.updated && `${result.updated} ${reviewer || locale.source ? 'updated' : 'proposed'}`, result.unchanged && `${result.unchanged} unchanged`]
                  .filter(Boolean)
                  .join(', ') || 'Nothing changed.'}
              </p>
              {result.skipped.length > 0 && (
                <div className="bg-secondary max-h-60 overflow-y-auto rounded-lg p-3">
                  <p className="mb-2 font-semibold">{result.skipped.length} skipped</p>
                  <ul className="grid gap-1">
                    {result.skipped.map((s) => (
                      <li key={s.key}><span className="font-mono text-xs">{s.key}</span> <span className="text-muted-foreground">{s.reason}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              <Button className="justify-self-end" onClick={() => close(false)}>Done</Button>
            </div>
          ) : (
            <>
              <label className="border-input hover:border-foreground/40 grid cursor-pointer place-items-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center text-sm transition-colors">
                <UploadIcon className="text-muted-foreground size-5" />
                <span className="font-semibold">{file ? file.name : 'Choose a file'}</span>
                <span className="text-muted-foreground">{file ? `${count} ${count === 1 ? 'message' : 'messages'}` : 'JSON, .properties or .strings'}</span>
                <input type="file" accept=".json,.properties,.strings" className="sr-only" onChange={(e) => read(e.target.files?.[0])} />
              </label>
              {problem && <p role="alert" className="text-destructive text-sm">{problem}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
                <Button disabled={!file || busy} onClick={send}>
                  {busy && <Spinner />}
                  Import {count || ''}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
