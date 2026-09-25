import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRoundIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { AuthCard } from '@/components/auth-card'
import { PasswordFields } from '@/components/password-fields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Splash } from '@/components/splash'
import { api } from '@/lib/api'
import { passwordProblem } from '@/lib/password'
import { plugin } from '@/plugin'

type LoginMethod = { id: string; name: string; url: string; kind: 'form' | 'redirect' }

/**
 * Where to go once signed in. The server's entry point sends a browser to `/login?redirect=<target>`;
 * anywhere else the SPA itself answered 401, so the target is the current URL. Local paths only.
 */
export function returnTo() {
  const target = location.pathname === '/login' ? new URLSearchParams(location.search).get('redirect') : location.pathname + location.search
  return target?.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\') ? target : '/'
}

type Problem = { field?: 'username' | 'password'; message: string }

/** What the browser's own validation would say, said in the card instead of in a bubble that is easy to miss. */
function check(form: HTMLFormElement, first: boolean): Problem | null {
  const data = new FormData(form)
  const password = String(data.get('password'))
  if (!/^[^\s@]+@[^\s@]+$/.test(String(data.get('username')).trim())) return { field: 'username', message: 'Enter an email address, like name@example.com.' }
  if (!first) return password ? null : { field: 'password', message: 'Enter your password.' }
  const weak = passwordProblem(password, String(data.get('confirmation')))
  return weak ? { field: 'password', message: weak } : null
}

/**
 * §11 sign-in: a password form, single sign-on buttons, or both — whatever the install configured.
 * On a fresh install it says so: the first account created here, or the first single sign-on, gets
 * full access (see `SetupService`).
 */
export function SignIn({ refused }: { refused?: string } = {}) {
  const client = useQueryClient()
  const { data: methods } = useQuery({ queryKey: ['auth-methods'], queryFn: () => api<LoginMethod[]>('/auth/methods') })
  const setup = useQuery({ queryKey: ['setup'], queryFn: () => api<{ firstUser: boolean }>('/api/setup'), retry: false })
  const [problem, setProblem] = useState<Problem | null>(null)
  const [pending, setPending] = useState(false)
  const redirect = `?redirect=${encodeURIComponent(returnTo())}`
  const form = methods?.find((m) => m.kind === 'form')
  const redirects = methods?.filter((m) => m.kind === 'redirect') ?? []
  const first = !!setup.data?.firstUser
  // Nothing to choose, and nothing to warn about: go straight to the only provider. Never when the
  // server refused the session that provider just gave us — that is how a sign-in loop is made, and
  // never when a plugin offers a way in of its own: then there is something to choose.
  const straightThrough = !setup.isPending && !first && !refused && !form && redirects.length === 1 && !plugin.signIn

  useEffect(() => {
    if (straightThrough) location.href = redirects[0].url + redirect
  }, [straightThrough, redirects, redirect])

  if (!methods || setup.isPending || straightThrough) return <Splash className="min-h-svh">Redirecting to sign in…</Splash>

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = event.currentTarget
    const invalid = check(target, first)
    setProblem(invalid)
    if (invalid) return (target.elements.namedItem(invalid.field!) as HTMLInputElement).focus()
    setPending(true)
    const data = new FormData(target)
    if (first) {
      const created = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: data.get('name'), email: data.get('username'), password: data.get('password') }),
      })
      if (!created.ok) {
        setPending(false)
        if (created.status === 409) client.invalidateQueries({ queryKey: ['setup'] })
        return setProblem({ message: created.status === 409 ? 'The first account was just created. Sign in instead.' : 'The account could not be created. Try again.' })
      }
    }
    data.delete('name')
    // The 303 is the success signal; following it would only fetch the target in the background.
    const response = await fetch(form!.url, { method: 'POST', redirect: 'manual', body: new URLSearchParams(data as never) })
    if (response.type === 'opaqueredirect') return location.replace(returnTo())
    setPending(false)
    setProblem({ message: response.status === 401 ? 'Wrong email or password.' : 'Sign-in failed. Try again.' })
  }

  const field = (name: Problem['field']) => ({ 'aria-invalid': problem?.field === name, onChange: () => problem?.field === name && setProblem(null) })

  return (
    <AuthCard title={refused ? "Can't sign in" : first && form ? 'Create the first account' : 'Sign in'}>
        {!refused && <p className="text-muted-foreground mb-7">{first ? 'No users yet.' : 'Welcome back.'}</p>}
        {refused ? (
          <div role="alert" className="text-destructive bg-destructive/8 mt-5 rounded-2xl p-4 text-sm leading-relaxed">
            <p className="mb-2">{refused}</p>
            {/* Signing in again would arrive with the same identity and be refused again: the way on is out. */}
            <form method="POST" action="/auth/logout">
              <button type="submit" className="cursor-pointer font-medium underline underline-offset-4">
                Sign out and try another account
              </button>
            </form>
          </div>
        ) : (
        <>
        {first && (
          <motion.div
            role="note"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="bg-secondary text-foreground mb-6 flex gap-3 rounded-2xl p-4 text-sm leading-relaxed">
              <KeyRoundIcon className="mt-0.5 size-4 shrink-0" />
              <p>
                {form
                  ? 'This account will be the admin, with access to everything.'
                  : 'The first person to sign in becomes the admin.'}
                {form && redirects.length > 0 && ' Signing in with single sign-on first does the same.'}
              </p>
            </div>
          </motion.div>
        )}
        {form && (
          <form onSubmit={submit} noValidate className="grid gap-4">
            {first && (
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">
                  Name <span className="text-muted-foreground font-normal">(optional)</span>
                </span>
                <Input name="name" autoComplete="name" autoFocus />
              </label>
            )}
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Email</span>
              <Input name="username" type="email" autoComplete="username" autoFocus={!first} {...field('username')} />
            </label>
            {first ? (
              <PasswordFields invalid={problem?.field === 'password'} onEdit={() => problem?.field === 'password' && setProblem(null)} />
            ) : (
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">Password</span>
                <Input name="password" type="password" autoComplete="current-password" {...field('password')} />
              </label>
            )}
            {problem && (
              <motion.p key={problem.message} role="alert" initial={{ x: -6 }} animate={{ x: [6, -4, 2, 0] }} className="text-destructive text-sm">
                {problem.message}
              </motion.p>
            )}
            <Button type="submit" size="lg" disabled={pending} className="mt-2">
              {first ? 'Create account' : 'Sign in'}
            </Button>
          </form>
        )}
        {form && redirects.length > 0 && (
          <div className="text-muted-foreground my-4 flex items-center gap-3 text-[13px]">
            <span className="bg-border h-px flex-1" />
            or
            <span className="bg-border h-px flex-1" />
          </div>
        )}
        <div className="grid gap-2">
          {redirects.map((m) => (
            <Button key={m.id} size="lg" variant={form ? 'outline' : 'default'} onClick={() => (location.href = m.url + redirect)}>
              Continue with {m.name}
            </Button>
          ))}
          {plugin.signIn}
        </div>
        </>
        )}
    </AuthCard>
  )
}
