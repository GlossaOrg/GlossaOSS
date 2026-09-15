import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { AuthCard } from '@/components/auth-card'
import { PasswordFields } from '@/components/password-fields'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { passwordProblem } from '@/lib/password'

/** §11: an administrator retired this account's password. Nothing else happens until a new one is chosen. */
export function ChangePassword() {
  const client = useQueryClient()
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password'))
    const invalid = passwordProblem(password, String(form.get('confirmation')))
    if (invalid) return setProblem(invalid)
    setPending(true)
    try {
      await api('/api/me/password', { method: 'POST', json: { password } })
    } catch (refused) {
      setPending(false)
      return setProblem((refused as { detail?: string }).detail || 'The password could not be changed. Try again.')
    }
    client.invalidateQueries({ queryKey: ['me'] })
  }

  return (
    <AuthCard title="Choose a new password">
      <p className="text-muted-foreground mb-7 text-sm">An admin reset your password. Choose a new one to continue.</p>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <PasswordFields invalid={!!problem} onEdit={() => setProblem(null)} autoFocus />
        {problem && (
          <motion.p role="alert" initial={{ x: -6 }} animate={{ x: [6, -4, 2, 0] }} className="text-destructive text-sm">
            {problem}
          </motion.p>
        )}
        <Button type="submit" disabled={pending} className="mt-1">
          Set password
        </Button>
      </form>
    </AuthCard>
  )
}
