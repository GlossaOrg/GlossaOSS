import type { ReactNode } from 'react'
import { InboxIcon, KeyRoundIcon, LanguagesIcon, LayoutDashboardIcon, MessagesSquareIcon, RocketIcon, type LucideIcon } from 'lucide-react'
import { ApiKeys } from '@/components/api-keys'
import { Content } from '@/components/content-board'
import { Locales } from '@/components/locales'
import { MessageEditor, NewMessage } from '@/components/message-editor'
import { Releases } from '@/components/releases'
import { covers, useProject, type Role } from '@/lib/projects'
import { plugin } from '@/plugin'

/**
 * A sidebar entry and the route behind it. `role` is the least project role that may open it;
 * `hidden` keeps a route out of the sidebar without keeping it out of the router — what a screen
 * links into, like one message, is reached by URL and listed nowhere.
 */
export type Screen = { title: string; url: string; icon: LucideIcon; element: ReactNode; role?: Role; hidden?: boolean }

/** A tab of the Settings dialog: what the installation holds outside a single project. */
export type SettingsTab = { id: string; title: string; icon: LucideIcon; element: ReactNode }

const core: Screen[] = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboardIcon, element: <Dashboard /> },
  { title: 'Content', url: '/content', icon: MessagesSquareIcon, element: <Content /> },
  { title: 'New message', url: '/content/new', icon: MessagesSquareIcon, element: <NewMessage />, role: 'MANAGER', hidden: true },
  { title: 'Message', url: '/content/:resource', icon: MessagesSquareIcon, element: <MessageEditor />, hidden: true },
  { title: 'Locales', url: '/locales', icon: LanguagesIcon, element: <Locales />, role: 'MANAGER' },
  { title: 'Releases', url: '/releases', icon: RocketIcon, element: <Releases />, role: 'MANAGER' },
  { title: 'API keys', url: '/keys', icon: KeyRoundIcon, element: <ApiKeys />, role: 'MANAGER' },
]

// A plugin's screens come first and take the url, so a plugin can replace a core screen.
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
        Open Content to add the first message, or Locales to pick the languages first.
      </p>
    </section>
  )
}
