import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, DownloadIcon, UploadIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { cn } from 'cn'
import { Language } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useProject } from '@/lib/projects'
import { day, state, status, useLocale, type Locale, type Release, type Resource } from '@/lib/content'

type Catalog = { profile: string; icuVersion: string; cldrVersion: string }

/** §10: a catalog is immutable under its hash, so publishing twice with no change keeps the release. */
export function Releases() {
  const project = useProject().project!
  const { rows, locales } = useLocale(project.id)
  const ordered = [...rows].sort((a, b) => Number(b.source) - Number(a.source) || a.locale.localeCompare(b.locale))

  return (
    <div className="page grid gap-8">
      <header>
        <h2 className="mb-2">Releases</h2>
        <p className="text-muted-foreground text-[17px]">Each locale publishes on its own, and only what is approved goes in.</p>
      </header>

      {locales.error ? (
        <p role="alert" className="text-destructive">Could not load the locales. Reload the page.</p>
      ) : !locales.data ? (
        <div className="divide-y border-y" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="py-3.5" style={{ opacity: 1 - i * 0.3 }}>
              <Skeleton className="h-5 w-72" />
            </div>
          ))}
        </div>
      ) : (
        <div className="border-y">
          <div className={cn('text-muted-foreground hidden border-b py-2 md:grid', columns)}>
            <span className="eyebrow">Language</span>
            <span className="eyebrow">Current release</span>
            <span className="eyebrow">Ready to publish</span>
            <span />
          </div>
          <ul className="divide-y">
            {ordered.map((l) => (
              <li key={l.locale}>
                <Row locale={l} projectId={project.id} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Row({ locale, projectId }: { locale: Locale; projectId: number }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const base = `/api/projects/${projectId}/catalogs/${encodeURIComponent(locale.locale)}`

  const [manifest, resources] = useQueries({
    queries: [
      { queryKey: ['manifest', projectId, locale.locale], queryFn: () => api<Release>(base), retry: false },
      { queryKey: ['resources', projectId, locale.locale], queryFn: () => api<Resource[]>(`/api/projects/${projectId}/resources?locale=${encodeURIComponent(locale.locale)}`) },
    ],
  })

  const catalog = useQueries({
    queries: [
      {
        queryKey: ['catalog', projectId, locale.locale, manifest.data?.hash],
        queryFn: () => api<Catalog>(`${base}/${manifest.data!.hash}`),
        enabled: !!manifest.data,
      },
    ],
  })[0]

  const publish = useMutation({
    mutationFn: () => api<Release>(base, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['manifest', projectId, locale.locale] }),
  })

  // ponytail: a client-side pre-flight. It catches what is untranslated, pending or outdated, but
  // not an approved message missing a plural form — publish still answers with the first of those.
  // Publication skips archived resources, so the pre-flight must not count them.
  const rows = (resources.data ?? []).filter((r) => !r.archived)
  const blocked = rows.filter((r) => status(r) !== 'approved')
  const ready = rows.length > 0 && blocked.length === 0

  const version = (v: string) => v.replace(/(\.0)+$/, '')

  return (
    <div className="py-3">
      <div className={cn('grid gap-y-2', columns)}>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Language locale={locale.locale} />
          {locale.source && <span className="bg-brand/10 text-brand rounded-full px-2 py-px text-[11px] font-medium">source</span>}
        </span>

        <span className="grid min-w-0 gap-0.5 text-sm">
          {manifest.data ? (
            <>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs">{manifest.data.hash.slice(0, 10)}</span>
                <span className="text-muted-foreground">{day.format(new Date(manifest.data.createdAt))}</span>
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
          {!rows.length ? (
            <span className="text-muted-foreground text-sm">Nothing to publish yet</span>
          ) : ready ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckIcon className="size-3.5" />
              {rows.length === 1 ? '1 message approved' : `All ${rows.length} messages approved`}
            </span>
          ) : (
            [...new Set(blocked.map(status))].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => navigate('/content')}
                className={cn('cursor-pointer rounded-full px-2 py-px text-xs font-medium transition-transform duration-200 motion-safe:hover:-translate-y-0.5', state(s).tint)}
              >
                {blocked.filter((b) => status(b) === s).length} {state(s).label.toLowerCase()}
              </button>
            ))
          )}
        </span>

        <span className="flex items-center gap-1.5 md:justify-end">
          {manifest.data && (
            <Button variant="ghost" size="sm" nativeButton={false} render={<a href={`${base}/${manifest.data.hash}`} target="_blank" rel="noreferrer" />}>
              <DownloadIcon />
              Catalog
            </Button>
          )}
          <Button size="sm" variant={ready ? 'default' : 'outline'} disabled={publish.isPending || !rows.length} onClick={() => publish.mutate()}>
            <UploadIcon className={cn('size-3.5', publish.isPending && 'motion-safe:animate-bounce')} />
            {ready ? 'Publish' : 'Publish anyway'}
          </Button>
        </span>
      </div>
      {publish.error ? <p role="alert" className="text-destructive mt-2 text-xs">{(publish.error as { detail?: string }).detail ?? 'Could not publish.'}</p> : null}
    </div>
  )
}

/** One grid for the header and every row, so the columns line up whatever a language is called. */
const columns = 'md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)_15rem] md:items-center gap-x-6'
