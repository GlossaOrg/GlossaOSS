import type { ReactNode } from 'react'
import { InboxIcon, KeyRoundIcon, LayoutDashboardIcon, type LucideIcon } from 'lucide-react'
import { ApiKeys } from '@/components/api-keys'
import { covers, useProject, type Role } from '@/lib/projects'
import { plugin } from '@/plugin'

/** A sidebar entry and the route behind it. `role` is the least project role that may open it. */
export type Screen = { title: string; url: string; icon: LucideIcon; element: ReactNode; role?: Role }

/** A tab of the Settings dialog: what the installation holds outside a single project. */
export type SettingsTab = { id: string; title: string; icon: LucideIcon; element: ReactNode }

const core: Screen[] = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboardIcon, element: <Dashboard /> },
  { title: 'API keys', url: '/keys', icon: KeyRoundIcon, element: <ApiKeys />, role: 'MANAGER' },
]

// A downstream build's screens come first and take the url: a shell whose widest scope is not the
// project has its own thing to say where the core says "nothing to translate yet".
const claimed = new Set((plugin.screens ?? []).map((screen) => screen.url))
const screens: Screen[] = [...(plugin.screens ?? []), ...core.filter((screen) => !claimed.has(screen.url))]

/**
 * The one permission gate of the frontend: the screens the caller may open on the selected project. The sidebar lists exactly these and the router routes exactly these, so a screen
 * without the role is neither shown nor reachable — its URL is a 404 like any other. The server
 * still decides; this only keeps the UI from offering what it would refuse.
 */
export function useScreens() {
  const { project } = useProject()
  return screens.filter((s) => !s.role || (project && covers(project.role, s.role)))
}

/** What the dashboard says until the domain exists. */
function Dashboard() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center p-10 text-center">
      <div className="bg-brand/10 text-brand mb-7 grid size-14 place-items-center rounded-xl">
        <InboxIcon className="size-6 motion-safe:animate-[float_4s_ease-in-out_infinite]" />
      </div>
      <h2 className="mb-3">Nothing to translate yet</h2>
      <p className="text-muted-foreground max-w-md text-[17px] leading-relaxed text-balance">
        Content schemas, keys, locales and the review queue appear here as they are built.
      </p>
    </section>
  )
}
