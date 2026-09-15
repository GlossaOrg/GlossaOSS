import { cn } from 'cn'
import { Spinner } from '@/components/ui/spinner'

/**
 * The one loading and failure surface — everything that waits, waits like this, centred and
 * still. Anything that spins in a corner of its own is a bug, not a variant.
 *
 * <p>Exported rather than local to App because plugin screens (see `@/plugin`) wait too, and a
 * second spinner styled slightly differently is exactly what this replaces. Pass
 * `className="min-h-svh"` when it stands alone outside the app shell.
 */
export function Splash({
  children,
  failed,
  className,
}: {
  children: React.ReactNode
  failed?: boolean
  className?: string
}) {
  return (
    <div className={cn('grid flex-1 place-items-center p-8', className)}>
      <div className="text-muted-foreground flex items-center gap-3 text-sm motion-safe:animate-in motion-safe:fade-in motion-safe:[animation-delay:150ms] motion-safe:[animation-fill-mode:both]">
        {!failed && <Spinner className="size-5" />}
        {children}
      </div>
    </div>
  )
}
