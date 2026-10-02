import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** One protected confirmation for actions that invalidate or remove data. */
export function ConfirmDialog({ open, onOpenChange, title, description, action, pendingLabel, pending = false, destructive = true, icon, error, onConfirm }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  action: string
  pendingLabel?: string
  pending?: boolean
  destructive?: boolean
  icon?: ReactNode
  error?: string
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={destructive ? 'destructive' : 'default'} disabled={pending} onClick={onConfirm}>
            {icon}
            {pending ? (pendingLabel ?? `${action}…`) : action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
