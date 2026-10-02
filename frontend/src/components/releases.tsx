import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { DownloadIcon, UnplugIcon, UploadIcon } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/kit'
import { Language, languageName } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { OneTimeNote } from '@/components/one-time-note'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { api } from '@/lib/api'
import { useProject } from '@/lib/projects'
import { day, state, useLocale, useProgress, type Locale, type Progress, type Release, type Status } from '@/lib/content'

type Catalog = { profile: string; icuVersion: string; cldrVersion: string }

/** §10: a catalog is immutable under its hash, so publishing twice with no change keeps the release. */
export function Releases() {
  const project = useProject().project!
  const { rows, locales, source } = useLocale(project.id)
  const progress = useProgress(project.id)

  return (
    <div className="page grid gap-5">
      <header>
        <h2>Releases</h2>
        <p className="text-muted-foreground mt-1.5 max-w-[72ch] text-sm">Each language publishes on its own, and only what is approved goes in.</p>
      </header>

      <div className="grid gap-3 @5xl/main:grid-cols-[minmax(0,1fr)_20rem] @5xl/main:items-start">
        <div className="min-w-0">
          {locales.error || progress.error ? (
            <p role="alert" className="text-destructive">Could not load the releases. Reload the page.</p>
          ) : !locales.data ? (
            <div className="card divide-y px-5" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="py-3.5" style={{ opacity: 1 - i * 0.3 }}>
                  <Skeleton className="h-5 w-72" />
                </div>
              ))}
            </div>
          ) : (
            <div className="card px-5">
              <div className={cn('text-muted-foreground hidden border-b py-3 md:grid', columns)}>
                <span className="eyebrow">Language</span>
                <span className="eyebrow">Current release</span>
                <span className="eyebrow">Ready to publish</span>
                <span />
              </div>
              <ul className="divide-y">
                {rows.map((l) => (
                  <li key={l.locale} className="reveal">
                    <Row locale={l} progress={progress.data?.find((p) => p.locale === l.locale)} fallback={l.fallbackLocale ?? (l.source ? undefined : source?.locale)} projectId={project.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Webhook projectId={project.id} />
      </div>
    </div>
  )
}

type WebhookView = { url: string | null; secret: string | null }

/** Where a new release is announced, so an app can fetch it instead of polling the manifest. */
function Webhook({ projectId }: { projectId: number }) {
  const client = useQueryClient()
  const path = `/api/projects/${projectId}/webhook`
  const current = useQuery({ queryKey: ['webhook', projectId], queryFn: () => api<WebhookView>(path) })
  const [draft, setDraft] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'change' | 'remove' | null>(null)
  const save = useMutation({
    mutationFn: (url: string | null) => api<WebhookView>(path, { method: 'PUT', json: { url } }),
    onSuccess: (saved) => {
      setConfirming(null)
      setDraft(null)
      setSecret(saved.secret)
      client.setQueryData(['webhook', projectId], { ...saved, secret: null })
    },
  })
  const url = current.data?.url ?? null
  return (
    <aside className="min-w-0 @5xl/main:sticky @5xl/main:top-20">
      <AnimatePresence>
        {secret && (
          <OneTimeNote key={secret} title="Copy the webhook secret" secret={secret} onClose={() => setSecret(null)}>
            Each call carries X-Glossa-Signature: sha256= and the HMAC of its body under this secret. It is shown once; saving the URL again makes a new one.
          </OneTimeNote>
        )}
      </AnimatePresence>
      <section className="card grid gap-4 p-4">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <h3>Webhook</h3>
            <Badge className={url ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-100' : undefined}>{url ? 'Active' : 'Off'}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">Send each release to a signed endpoint.</p>
        </header>
        {draft !== null ? (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (url) setConfirming('change')
              else save.mutate(draft.trim())
            }}
          >
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              Endpoint URL
              <Input type="url" value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus required placeholder="https://example.com/hooks/glossa" className="font-mono text-sm" />
            </label>
            <span className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={save.isPending}>Save</Button>
            </span>
          </form>
        ) : url ? (
          <div className="grid gap-3">
            <p className="text-muted-foreground truncate font-mono text-xs" title={url}>{url}</p>
            <span className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={() => setDraft(url)}>Change</Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirming('remove')}>
                <UnplugIcon />
                Remove
              </Button>
            </span>
          </div>
        ) : (
          <Button size="sm" className="justify-self-start" disabled={!current.data} onClick={() => setDraft('')}>Set endpoint</Button>
        )}
        {save.error && !confirming ? <p role="alert" className="text-destructive text-xs">{(save.error as { detail?: string }).detail ?? 'Could not save the webhook.'}</p> : null}
      </section>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming === 'change' ? 'Change endpoint and secret?' : 'Remove this webhook?'}
        description={confirming === 'change'
          ? 'The current secret stops working immediately. Update the receiver with the new secret after saving.'
          : 'New releases will no longer be sent to this endpoint.'}
        action={confirming === 'change' ? 'Change endpoint' : 'Remove webhook'}
        pending={save.isPending}
        destructive={confirming === 'remove'}
        icon={confirming === 'remove' ? <UnplugIcon /> : undefined}
        error={(save.error as { detail?: string } | null)?.detail}
        onConfirm={() => save.mutate(confirming === 'change' ? draft!.trim() : null)}
      />
    </aside>
  )
}

function Row({ locale, progress, fallback, projectId }: { locale: Locale; progress?: Progress; fallback?: string; projectId: number }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const { select } = useLocale(projectId)
  const [confirming, setConfirming] = useState(false)
  const base = `/api/projects/${projectId}/catalogs/${encodeURIComponent(locale.locale)}`
  const release = progress?.release

  const catalog = useQuery({
    queryKey: ['catalog', projectId, locale.locale, release?.hash],
    queryFn: () => api<Catalog>(`${base}/${release!.hash}`),
    enabled: !!release,
    staleTime: Infinity,
  })

  const publish = useMutation({
    mutationFn: () => api<Release>(base, { method: 'POST' }),
    onSuccess: (published) => {
      setConfirming(false)
      client.setQueryData<Progress[]>(['resources', projectId, 'progress'], (current) =>
        current?.map((item) => item.locale === locale.locale ? { ...item, current: true, release: published } : item))
      toast.success(release?.hash === published.hash
        ? `${languageName(locale.locale)} v${published.version} is already current.`
        : `${languageName(locale.locale)} v${published.version} is live.`)
      return client.invalidateQueries({ queryKey: ['resources', projectId, 'progress'] })
    },
  })

  // ponytail: a client-side pre-flight. It catches what is untranslated, pending or outdated, but
  // not an approved message missing a plural form — publish still answers with the first of those.
  const total = progress?.total ?? 0
  const blocked: [Status, number][] = progress
    ? ([['untranslated', progress.untranslated], ['review', progress.review], ['rejected', progress.rejected], ['outdated', progress.outdated]] as [Status, number][]).filter(([, n]) => n)
    : []
  const missing = blocked.reduce((sum, [, n]) => sum + n, 0)
  const ready = total > 0 && missing === 0
  const open = (s: Status) => {
    select(locale.locale)
    navigate(`/content?status=${s}`)
  }

  const version = (v: string) => v.replace(/(\.0)+$/, '')

  return (
    <div className="py-5">
      <div className={cn('grid gap-y-3', columns)}>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Language locale={locale.locale} />
          {locale.source && <Badge className="bg-foreground text-background">Source</Badge>}
        </span>

        <span className="grid min-w-0 gap-0.5 text-sm">
          {release ? (
            <>
              <span className="flex items-center gap-2">
                <span className="font-medium">v{release.version}</span>
                <span className="font-mono text-xs">{release.hash.slice(0, 10)}</span>
                <span className="text-muted-foreground">{day.format(new Date(release.createdAt))}</span>
              </span>
              {catalog.data && (
                <span className="text-muted-foreground text-xs">
                  ICU {version(catalog.data.icuVersion)} · CLDR {version(catalog.data.cldrVersion)}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Never published</span>
          )}
        </span>

        <span className="flex flex-wrap items-center gap-1.5">
          {!progress ? (
            <Skeleton className="h-5 w-32" />
          ) : !total ? (
            <span className="text-muted-foreground text-sm">Nothing to publish yet</span>
          ) : ready ? (
            <Badge className={state('approved').tint}>All {total} approved</Badge>
          ) : (
            blocked.map(([s, n]) => (
              <button key={s} type="button" onClick={() => open(s)} className="cursor-pointer transition-opacity hover:opacity-70">
                <Badge className={state(s).tint}>
                  {n} {state(s).label.toLowerCase()}
                </Badge>
              </button>
            ))
          )}
        </span>

        <span className="flex items-center gap-1.5 md:justify-end">
          {release && (
            <Button variant="ghost" size="sm" nativeButton={false} render={<a href={`${base}/${release.hash}`} target="_blank" rel="noreferrer" />}>
              <DownloadIcon />
              Download
            </Button>
          )}
          {progress && total > 0 && !progress.current && (
            <Button size="sm" variant={ready ? 'default' : 'outline'} disabled={publish.isPending || confirming} onClick={() => (ready ? publish.mutate() : setConfirming(true))}>
              <UploadIcon />
              {publish.isPending ? 'Publishing…' : ready ? 'Publish' : 'Publish anyway'}
            </Button>
          )}
        </span>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Publish ${languageName(locale.locale)} anyway?`}
        description={<>
          {missing === 1 ? '1 message is' : `${missing} messages are`} not approved.{' '}
          {fallback ? <>Readers will see {languageName(fallback)} there instead.</> : 'They are left out of the catalog.'}
        </>}
        action="Publish anyway"
        pendingLabel="Publishing…"
        pending={publish.isPending}
        destructive={false}
        icon={<UploadIcon />}
        error={(publish.error as { detail?: string } | null)?.detail}
        onConfirm={() => publish.mutate()}
      />
      {publish.error && !confirming ? <p role="alert" className="text-destructive mt-2 text-xs">{(publish.error as { detail?: string }).detail ?? 'Could not publish.'}</p> : null}
    </div>
  )
}

/** One grid for the header and every row, so the columns line up whatever a language is called. */
const columns = 'md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)_15rem] md:items-center gap-x-6'
