import { Input } from '@/components/ui/input'
import { passwordRules } from '@/lib/password'

/** The password and its confirmation, asked the same way wherever one is chosen: sign-up, invitation, reset. */
export function PasswordFields({ label = 'Password', invalid, onEdit, autoFocus }: { label?: string; invalid?: boolean; onEdit: () => void; autoFocus?: boolean }) {
  return (
    <>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <Input name="password" type="password" autoComplete="new-password" aria-invalid={invalid} autoFocus={autoFocus} onChange={onEdit} />
        <span className="text-muted-foreground text-xs">{passwordRules}</span>
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Repeat it</span>
        <Input name="confirmation" type="password" autoComplete="new-password" aria-invalid={invalid} onChange={onEdit} />
      </label>
    </>
  )
}
