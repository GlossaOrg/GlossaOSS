import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { BookOpenIcon, PlusIcon, RefreshCwIcon } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Flag } from '@/components/locale'
import { OneTimeNote } from '@/components/one-time-note'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { roles, useProject, type Role } from '@/lib/projects'

type Key = { id: number; name: string; role: Role; locale: string | null; createdAt: string; expiresAt: string | null; revokedAt: string | null }
type IssuedKey = { id: number; name: string; role: Role; locale: string | null; token: string }

const expiries = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
  { label: 'Never', days: 0 },
]

const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

const isActive = (k: Key) => !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > new Date())

/** Height-and-fade in and out, for anything that opens inside the flow of the page. */
const unfold = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease: [0.2, 0, 0, 1] },
} as const

/** §11: the selected project's keys for services. Gated to managers by `useScreens()`. */
export function ApiKeys() {
  const project = useProject().project!
  const client = useQueryClient()
  const path = `/api/projects/${project.id}/keys`
  const keys = useQuery({ queryKey: ['keys', project.id], queryFn: () => api<Key[]>(path) })
  const [composing, setComposing] = useState(false)
  const [issued, setIssued] = useState<IssuedKey | null>(null)
  const refresh = () => client.invalidateQueries({ queryKey: ['keys', project.id] })
  const onIssued = (key: IssuedKey) => {
    setIssued(key)
    setComposing(false)
    refresh()
  }
  const active = keys.data?.filter(isActive) ?? []
  const inactive = keys.data?.filter((k) => !isActive(k)) ?? []

  return (
    <div className="page grid gap-x-16 gap-y-14 lg:py-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="mb-2">API keys</h2>
            <p className="text-muted-foreground text-[17px]">Services use these to reach {project.name} without signing in.</p>
          </div>
          <Button onClick={() => setComposing(true)} disabled={composing}>
            <PlusIcon className="transition-transform duration-300 motion-safe:group-hover/button:rotate-90" />
            New key
          </Button>
        </header>

        <AnimatePresence initial={false}>
          {issued && (
            <OneTimeNote
              key={issued.token}
              title={`Copy the token for ${issued.name}`}
              secret={issued.token}
              onClose={() => setIssued(null)}
            >
              It is shown once. If you lose it, rotate the key.
            </OneTimeNote>
          )}
          {composing && <Composer key="composer" path={path} onIssued={onIssued} onCancel={() => setComposing(false)} />}
        </AnimatePresence>

        {keys.error ? (
          <p role="alert" className="text-destructive">Could not load keys. Reload the page.</p>
        ) : !keys.data ? (
          <div className="divide-y border-y" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid gap-2 py-4" style={{ opacity: 1 - i * 0.3 }}>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-72" />
              </div>
            ))}
          </div>
        ) : active.length === 0 && !composing ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-y py-10">
            <p className="font-medium">No active keys</p>
            <p className="text-muted-foreground text-sm">Use one key per service, so you can revoke them separately.</p>
          </motion.div>
        ) : (
          <KeyList keys={active} path={path} onIssued={onIssued} onRevoked={refresh} />
        )}

        {inactive.length > 0 && (
          <details className="group mt-12">
            <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-sm transition-colors select-none">
              {inactive.length} revoked or expired
            </summary>
            <KeyList keys={inactive} path={path} onIssued={onIssued} onRevoked={refresh} className="mt-3 opacity-70" />
          </details>
        )}
      </div>

      <aside className="grid content-start gap-10 text-sm xl:pt-2">
        <section>
          <h3 className="mb-4 text-base">Roles</h3>
          <dl className="grid gap-3.5">
            {roles.map((r) => (
              <div key={r.value}>
                <dt>
                  <RoleTag role={r.value} />
                </dt>
                <dd className="text-muted-foreground mt-1">{r.does}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3 className="mb-2 text-base">Using a key</h3>
          <p className="text-muted-foreground mb-3">Send it as a bearer token to the API.</p>
          <pre className="bg-background mb-3 overflow-x-auto rounded-lg p-3 font-mono text-xs leading-relaxed">{'Authorization: Bearer gk_…'}</pre>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href="/openapi/docs" target="_blank" rel="noreferrer" />}>
            <BookOpenIcon className="transition-transform duration-300 motion-safe:group-hover/button:-rotate-6" />
            API reference
          </Button>
        </section>
      </aside>
    </div>
  )
}

function KeyList({ keys, className, ...row }: { keys: Key[]; path: string; onIssued: (key: IssuedKey) => void; onRevoked: () => void; className?: string }) {
  return (
    <ul className={cn('divide-y border-y', className)}>
      <AnimatePresence initial={false}>
        {keys.map((k) => (
          <motion.li key={k.id} layout="position" {...unfold} className="overflow-hidden">
            <KeyRow k={k} {...row} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

function KeyRow({ k, path, onIssued, onRevoked }: { k: Key; path: string; onIssued: (key: IssuedKey) => void; onRevoked: () => void }) {
  const [confirming, setConfirming] = useState<'rotate' | 'revoke' | null>(null)
  // gcTime 0: a token must not outlive the note that shows it, not even in the mutation cache.
  const rotate = useMutation({ mutationFn: () => api<IssuedKey>(`${path}/${k.id}/rotate`, { method: 'POST' }), onSuccess: onIssued, gcTime: 0 })
  const revoke = useMutation({ mutationFn: () => api<void>(`${path}/${k.id}`, { method: 'DELETE' }), onSuccess: onRevoked })
  const action = confirming === 'rotate' ? rotate : revoke

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{k.name}</span>
            <RoleTag role={k.role} locale={k.locale} />
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">{lifetime(k)}</p>
        </div>
        {isActive(k) && (
          <div className={cn('-mr-2 flex gap-1 transition-opacity', confirming && 'pointer-events-none opacity-0')}>
            <Button variant="ghost" size="sm" onClick={() => setConfirming('rotate')}>
              <RefreshCwIcon className="transition-transform duration-500 motion-safe:group-hover/button:rotate-180" />
              Rotate
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirming('revoke')}>
              Revoke
            </Button>
          </div>
        )}
      </div>
      <AnimatePresence initial={false}>
        {confirming && (
          <motion.div {...unfold} className="overflow-hidden">
            <div className="bg-background mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg py-2 pr-2 pl-4 text-sm">
              <p className="min-w-60 flex-1">
                {confirming === 'rotate'
                  ? 'The old token stops working immediately.'
                  : 'Anything using this key stops working. This cannot be undone.'}
              </p>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
                <Button size="sm" variant={confirming === 'revoke' ? 'destructive' : 'default'} disabled={action.isPending} onClick={() => action.mutate()}>
                  {confirming === 'rotate' ? 'Rotate key' : 'Revoke key'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {action.error && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {confirming === 'rotate' ? 'The key could not be rotated.' : 'The key could not be revoked.'} Reload the page and try again.
        </p>
      )}
    </div>
  )
}

function Composer({ path, onIssued, onCancel }: { path: string; onIssued: (key: IssuedKey) => void; onCancel: () => void }) {
  const create = useMutation({ mutationFn: (json: object) => api<IssuedKey>(path, { method: 'POST', json }), onSuccess: onIssued, gcTime: 0 })

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const days = Number(form.get('expiry'))
    create.mutate({
      name: String(form.get('name')).trim(),
      role: form.get('role'),
      locale: String(form.get('locale')).trim() || null,
      expiresAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    })
  }

  return (
    <motion.div {...unfold} className="overflow-hidden">
      <form onSubmit={submit} className="border-brand mb-10 grid gap-6 border-l-2 py-1 pl-6">
        <label className="grid max-w-sm gap-1.5">
          <span className="text-sm font-medium">Name</span>
          <Input name="name" required autoFocus maxLength={80} placeholder="CI deploy" className="bg-background" />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Role</legend>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <label
                key={r.value}
                className={cn(
                  'has-focus-visible:ring-ring/50 has-checked:ring-foreground cursor-pointer rounded-full px-3 py-1 text-sm ring-1 ring-transparent transition-transform duration-200 has-focus-visible:ring-3 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95',
                  r.tint,
                )}
              >
                <input type="radio" name="role" value={r.value} defaultChecked={r.value === 'READER'} className="sr-only" />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-x-10 gap-y-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Expires after</legend>
            <div className="bg-foreground/[0.06] flex rounded-lg p-0.5">
              {expiries.map((e) => (
                <label key={e.label} className="has-checked:bg-background has-focus-visible:ring-ring/50 cursor-pointer rounded-md px-3 py-1 text-sm transition-[background-color,box-shadow] duration-200 has-checked:shadow-xs has-focus-visible:ring-3">
                  <input type="radio" name="expiry" value={e.days} defaultChecked={e.days === 90} className="sr-only" />
                  {e.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">
              Locale <span className="text-muted-foreground font-normal">(optional)</span>
            </span>
            <Input name="locale" maxLength={35} placeholder="All locales" className="bg-background w-40" />
          </label>
        </div>

        {create.error && (
          <p role="alert" className="text-destructive text-sm">
            The key could not be created. Try again.
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={create.isPending}>
            Create key
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </motion.div>
  )
}

function RoleTag({ role, locale }: { role: Role; locale?: string | null }) {
  const r = roles.find((x) => x.value === role)!
  return (
    <span className={cn('inline-flex rounded-full px-2 py-px text-xs font-medium', r.tint)}>
      {r.label}
      {locale && (
        <span className="ml-1.5 inline-flex items-center gap-1 opacity-80">
          <Flag locale={locale} className="size-3.5" />
          {locale}
        </span>
      )}
    </span>
  )
}

function lifetime(k: Key) {
  const created = `Created ${day.format(new Date(k.createdAt))}`
  if (k.revokedAt) return `${created}, revoked ${day.format(new Date(k.revokedAt))}`
  if (!k.expiresAt) return `${created}, never expires`
  return `${created}, ${new Date(k.expiresAt) > new Date() ? 'expires' : 'expired'} ${day.format(new Date(k.expiresAt))}`
}
