import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { cn } from 'cn'
import { Badge } from '@/components/kit'
import { Language, languageName } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
        <p className="text-muted-foreground mt-1.5 max-w-[52ch] text-[0.9375rem]">Each language publishes on its own, and only what is approved goes in.</p>
      </header>

      {locales.error ? (
        <p role="alert" className="text-destructive">Could not load the locales. Reload the page.</p>
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
    onSuccess: () => {
      setConfirming(false)
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
            <Badge dot="bg-emerald-500">{total === 1 ? '1 message approved' : `All ${total} approved`}</Badge>
          ) : (
            blocked.map(([s, n]) => (
              <button key={s} type="button" onClick={() => open(s)} className="cursor-pointer transition-opacity hover:opacity-70">
                <Badge dot={state(s).dot}>
                  {n} {state(s).label.toLowerCase()}
                </Badge>
              </button>
            ))
          )}
        </span>

        <span className="flex items-center gap-1.5 md:justify-end">
          {release && (
            <Button variant="ghost" size="sm" nativeButton={false} render={<a href={`${base}/${release.hash}`} target="_blank" rel="noreferrer" />}>
              Download
            </Button>
          )}
          <Button size="sm" variant={ready ? 'default' : 'outline'} disabled={publish.isPending || !total || confirming} onClick={() => (ready ? publish.mutate() : setConfirming(true))}>
            {publish.isPending ? 'Publishing…' : ready ? 'Publish' : 'Publish anyway'}
          </Button>
        </span>
      </div>
      {confirming && (
        <div className="bg-secondary mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm">
          <span>
            {missing === 1 ? '1 message is' : `${missing} messages are`} not approved in {languageName(locale.locale)}.{' '}
            {fallback ? <>Readers will see {languageName(fallback)} there instead.</> : 'They are left out of the catalog.'}
          </span>
          <span className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button size="sm" disabled={publish.isPending} onClick={() => publish.mutate()}>{publish.isPending ? 'Publishing…' : 'Publish anyway'}</Button>
          </span>
        </div>
      )}
      {publish.error ? <p role="alert" className="text-destructive mt-2 text-xs">{(publish.error as { detail?: string }).detail ?? 'Could not publish.'}</p> : null}
    </div>
  )
}

/** One grid for the header and every row, so the columns line up whatever a language is called. */
const columns = 'md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)_15rem] md:items-center gap-x-6'
