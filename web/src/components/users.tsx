import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { PlusIcon } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { cn } from 'cn'
import { Badge, RoleBadge, Segmented, Select } from '@/components/kit'
import { OneTimeNote } from '@/components/one-time-note'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useMe } from '@/lib/me'
import { roles, useProject, type Role } from '@/lib/projects'

type Membership = { project: number; name: string; role: Role; locale: string | null }
type Account = {
  id: number
  /** An invitation nobody has taken up yet, rather than an account. */
  invitation: boolean
  name: string | null
  email: string
  /** How this account signs in: "Password", or the host of the identity provider that vouches for it. */
  /** Every way this account can sign in: 'Password' and/or an identity provider's host. */
  sources: string[]
  administrator: boolean
  status: 'ACTIVE' | 'INVITED' | 'DISABLED' | 'DELETED'
  /** An administrator retired this account's password and it has not chosen a new one yet. */
  passwordReset: boolean
  createdAt: string
  expiresAt: string | null
  projects: Membership[]
}

type Invited = { id: number; email: string; link: string | null }
type Call = { path: string; method: string; done: string }

const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

const states = {
  ACTIVE: { label: 'Active', dot: 'bg-emerald-500' },
  INVITED: { label: 'Invited', dot: 'bg-amber-400' },
  DISABLED: { label: 'Disabled', dot: 'bg-muted-foreground/50' },
  DELETED: { label: 'Deleted', dot: undefined },
}

const expiries = [
  { label: '1 day', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'Never', days: 0 },
]

/** §11: every account in the installation, and every invitation waiting. Gated to administrators by `useScreens()`. */
export function Users() {
  const client = useQueryClient()
  const me = useMe().data
  const accounts = useQuery({ queryKey: ['users'], queryFn: () => api<Account[]>('/api/users') })
  const [inviting, setInviting] = useState(false)
  const [link, setLink] = useState<{ email: string; url: string } | null>(null)
  const refresh = () => client.invalidateQueries({ queryKey: ['users'] })
  const onIssued = (invited: Invited) => {
    setInviting(false)
    refresh()
    toast.success(invited.link ? `${invited.email} is invited. Send them the link below.` : `${invited.email} is invited. They sign in with single sign-on.`)
    if (invited.link) setLink({ email: invited.email, url: location.origin + invited.link })
  }

  return (
    <div className="min-w-0 pt-6">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <p className="text-muted-foreground max-w-prose">People can sign in only after an admin invites them.</p>
          <Button onClick={() => setInviting(true)} disabled={inviting}>
            <PlusIcon className="transition-transform duration-300 motion-safe:group-hover/button:rotate-90" />
            Invite
          </Button>
        </header>

        <AnimatePresence initial={false}>
          {link && (
            <OneTimeNote key={link.url} title={`Send this link to ${link.email}`} secret={link.url} onClose={() => setLink(null)}>
              It is shown once and works until it is used or expires.
            </OneTimeNote>
          )}
          {inviting && <Composer key="composer" onIssued={onIssued} onCancel={() => setInviting(false)} />}
        </AnimatePresence>

        {accounts.error ? (
          <p role="alert" className="text-destructive">Could not load users. Reload the page.</p>
        ) : !accounts.data ? (
          <div className="divide-y border-y" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid gap-2 py-4" style={{ opacity: 1 - i * 0.3 }}>
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-4 w-80" />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl border-collapse text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left whitespace-nowrap">
                  <th scope="col" className="py-2 pr-4 font-medium">Person</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Signs in with</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Projects</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {accounts.data.map((account) => (
                  <AccountRow key={`${account.invitation}-${account.id}`} account={account} self={account.id === me?.id && !account.invitation} onLink={setLink} onChanged={refresh} />
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

function AccountRow({ account, self, onLink, onChanged }: { account: Account; self: boolean; onLink: (link: { email: string; url: string }) => void; onChanged: () => void }) {
  const [confirming, setConfirming] = useState<'delete' | 'cancel' | null>(null)
  const act = useMutation({
    mutationFn: (call: Call) => api<Invited | void>(call.path, { method: call.method }),
    onSuccess: (result, call) => {
      setConfirming(null)
      onChanged()
      toast.success(call.done)
      if (result && 'link' in result && result.link) onLink({ email: result.email, url: location.origin + result.link })
    },
    gcTime: 0,
  })
  const run = (path: string, done: string, method = 'POST') => act.mutate({ path, method, done })
  const state = states[account.status]

  return (
    <>
      <tr className={cn('align-top', account.status === 'DELETED' && 'opacity-60')}>
        <td className="py-4 pr-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{account.name || account.email}</span>
            {account.administrator && (
              <Badge className="bg-primary text-primary-foreground">Admin</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5">{account.email}</p>
        </td>
        <td className="py-4 pr-4">
          <ul className="text-muted-foreground grid gap-1">
            {account.sources.map((source) => (
              <li key={source}>{source === 'Password' ? 'Password' : `Single sign-on (${source})`}</li>
            ))}
          </ul>
        </td>
        <td className="py-4 pr-4">
          {account.projects.length === 0 ? (
            <span className="text-muted-foreground">No projects</span>
          ) : (
            <ul className="grid gap-1.5">
              {account.projects.map((m) => (
                <li key={m.project} className="flex flex-wrap items-center gap-2">
                  <span>{m.name}</span>
                  <RoleBadge role={m.role} locale={m.locale} />
                </li>
              ))}
            </ul>
          )}
        </td>
        <td className="py-4 pr-4">
          <span className="flex flex-wrap gap-1">
            <Badge dot={state.dot} className={cn(account.status === 'DELETED' && 'line-through')}>{state.label}</Badge>
            {account.passwordReset && <Badge dot="bg-amber-400">Choosing a password</Badge>}
          </span>
          <p className="text-muted-foreground mt-1 text-xs whitespace-nowrap">
            {account.invitation
              ? account.expiresAt
                ? `Expires ${day.format(new Date(account.expiresAt))}`
                : 'Never expires'
              : `Added ${day.format(new Date(account.createdAt))}`}
          </p>
        </td>
        <td className="py-4 text-right">
          {!self && account.status !== 'DELETED' && !confirming && (
            <div className="-mr-2 flex justify-end gap-1">
              {account.invitation ? (
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirming('cancel')}>
                  Cancel invite
                </Button>
              ) : (
                <>
                  {account.sources.includes('Password') && (
                    <Button variant="ghost" size="sm" onClick={() => run(`/api/users/${account.id}/password-reset?days=7`, `Password reset. Send ${account.name || account.email} the link below.`)}>
                      Reset password
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      account.status === 'DISABLED'
                        ? run(`/api/users/${account.id}/enable`, `${account.name || account.email} can sign in again.`)
                        : run(`/api/users/${account.id}/disable`, `${account.name || account.email} is disabled and signs in nowhere.`)
                    }
                  >
                    {account.status === 'DISABLED' ? 'Enable' : 'Disable'}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirming('delete')}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          )}
          {self && <span className="text-muted-foreground text-xs">You</span>}
        </td>
      </tr>
      {(confirming || act.error) && (
        <tr>
          <td colSpan={5} className="pb-4">
            <div className="bg-secondary flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl py-3 pr-3 pl-5 text-sm">
              <p className="min-w-60 flex-1">
                {act.error
                  ? (act.error as { detail?: string }).detail || 'Something went wrong. Reload and try again.'
                  : confirming === 'cancel'
                    ? `The link sent to ${account.email} will stop working.`
                    : `${account.name || account.email} loses access and every project role. The account stays on record, so past changes keep their author.`}
              </p>
              {confirming && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={act.isPending}
                    onClick={() =>
                      confirming === 'cancel'
                        ? run(`/api/users/invites/${account.id}`, `Invitation to ${account.email} cancelled.`, 'DELETE')
                        : run(`/api/users/${account.id}`, `${account.name || account.email} no longer has access.`, 'DELETE')
                    }
                  >
                    {confirming === 'cancel' ? 'Cancel invite' : 'Delete account'}
                  </Button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Composer({ onIssued, onCancel }: { onIssued: (invited: Invited) => void; onCancel: () => void }) {
  const projects = useProject().projects.data ?? []
  const [sso, setSso] = useState(false)
  const invite = useMutation({ mutationFn: (json: object) => api<Invited>('/api/users/invites', { method: 'POST', json }), onSuccess: onIssued, gcTime: 0 })

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const project = String(form.get('project'))
    invite.mutate({
      email: String(form.get('email')).trim(),
      name: form.get('name'),
      sso,
      project: project ? Number(project) : null,
      role: project ? form.get('role') : null,
      locale: form.get('locale'),
      expiresInDays: Number(form.get('expiry')),
    })
  }

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }} className="overflow-hidden">
      <form onSubmit={submit} className="mb-10 grid max-w-3xl gap-6 rounded-[28px] border p-7">
        <div className="flex flex-wrap gap-x-8 gap-y-6">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Email</span>
            <Input name="email" type="email" required autoFocus className="w-64" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">
              Name <span className="text-muted-foreground font-normal">(optional)</span>
            </span>
            <Input name="name" autoComplete="name" className="w-48" />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Signs in with</legend>
          <Segmented
            name="access"
            options={[
              { label: 'A password link', value: false },
              { label: 'Single sign-on', value: true },
            ]}
            value={sso}
            onChange={setSso}
          />
          <p className="text-muted-foreground mt-2 text-sm">
            {sso
              ? 'They sign in with your identity provider. Their account is created the first time.'
              : 'You get a one-time link to send them. They choose their own password.'}
          </p>
        </fieldset>

        <div className="flex flex-wrap gap-x-8 gap-y-6">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">
              Project <span className="text-muted-foreground font-normal">(optional)</span>
            </span>
            <Select name="project" className="w-56">
              <option value="">No project yet</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Role there</legend>
            <Segmented name="role" loose options={roles.map((r) => ({ label: r.label, value: r.value }))} defaultValue={'TRANSLATOR' as Role} />
          </fieldset>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">
              Locale <span className="text-muted-foreground font-normal">(optional)</span>
            </span>
            <Input name="locale" maxLength={35} placeholder="All locales" className="w-36" />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Invitation expires after</legend>
          <Segmented name="expiry" options={expiries.map((e) => ({ label: e.label, value: e.days }))} defaultValue={7} />
        </fieldset>

        {invite.error && (
          <p role="alert" className="text-destructive text-sm">
            {(invite.error as { detail?: string }).detail || 'The invitation could not be created. Try again.'}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={invite.isPending}>
            Send invitation
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </motion.div>
  )
}
