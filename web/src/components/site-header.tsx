import { Logo } from '@/components/logo'
import { SidebarTrigger } from '@/components/ui/sidebar'

/** Phones only: the sidebar is a drawer there, and this is its handle. Wider, every screen names itself. */
export function SiteHeader() {
  return (
    <header className="bg-background/90 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-md md:hidden">
      <SidebarTrigger className="-ml-1 rounded-full" />
      <Logo className="h-5" />
    </header>
  )
}
