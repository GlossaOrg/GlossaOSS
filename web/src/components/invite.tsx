import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { AuthCard } from '@/components/auth-card'
import { PasswordFields } from '@/components/password-fields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Splash } from '@/components/splash'
import { api } from '@/lib/api'
import { passwordProblem } from '@/lib/password'

type Invitation = { email: string; name: string | null; reset: boolean }

/**
 * §11: the other end of an administrator's one-time link. It is the only way an account with a
 * password comes into being, and the only way a forgotten one is replaced.
 */
export function Invite({ token }: { token: string }) {
  const invitation = useQuery({ queryKey: ['invite', token], queryFn: () => api<Invitation>(`/api/invite/${token}`), retry: false })
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password'))
    const invalid = passwordProblem(password, String(form.get('confirmation')))
    if (invalid) return setProblem(invalid)
    setProblem(null)
    setPending(true)
    try {
      await api(`/api/invite/${token}`, { method: 'POST', json: { name: form.get('name'), password } })
    } catch (refused) {
      setPending(false)
      return setProblem((refused as { detail?: string }).detail || 'This invitation could not be accepted. Ask for a new one.')
    }
    // Straight in with what was just chosen, rather than dropping them on the sign-in screen.
    await fetch('/auth/form/login', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ username: invitation.data!.email, password }) })
    location.replace('/')
  }

  if (invitation.isPending) return <Splash className="min-h-svh">Opening your invitation…</Splash>
  if (invitation.error) {
    return (
      <AuthCard title="This link has expired">
        <p className="text-muted-foreground mb-7 text-sm">
          {(invitation.error as { detail?: string }).detail || 'It was already used or has expired. Ask an admin for a new one.'}
        </p>
        <Button variant="outline" nativeButton={false} render={<a href="/" />}>
          Go to sign in
        </Button>
      </AuthCard>
    )
  }

  const { email, name, reset } = invitation.data!
  return (
    <AuthCard title={reset ? 'Choose a new password' : 'Welcome to Glossa'}>
      <p className="text-muted-foreground mb-7 text-sm">{reset ? `For ${email}.` : `You were invited as ${email}. Choose a password to continue.`}</p>
      <form onSubmit={submit} noValidate className="grid gap-4">
        {!reset && (
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">
              Name <span className="text-muted-foreground font-normal">(optional)</span>
            </span>
            <Input name="name" autoComplete="name" defaultValue={name ?? ''} autoFocus />
          </label>
        )}
        <PasswordFields invalid={!!problem} onEdit={() => setProblem(null)} autoFocus={reset} />
        {problem && (
          <motion.p role="alert" initial={{ x: -6 }} animate={{ x: [6, -4, 2, 0] }} className="text-destructive text-sm">
            {problem}
          </motion.p>
        )}
        <Button type="submit" disabled={pending} className="mt-1">
          {reset ? 'Set password' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  )
}
