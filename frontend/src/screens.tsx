import { lazy, type ReactNode } from 'react'
import { BookOpenIcon, HouseIcon, KeyRoundIcon, LanguagesIcon, MessagesSquareIcon, RocketIcon, type LucideIcon } from 'lucide-react'
import { Content } from '@/components/content-board'
import { Home } from '@/components/home'
import { covers, useProject, type Role } from '@/lib/projects'

/**
 * A sidebar entry and the route behind it. `role` is the least project role that may open it;
 * `hidden` keeps a route out of the sidebar without keeping it out of the router — what a screen
 * links into, like one message, is reached by URL and listed nowhere.
 */
export type Screen = { title: string; url: string; icon: LucideIcon; element: ReactNode; role?: Role; hidden?: boolean }

/** A tab of the Settings dialog: what the installation holds outside a single project. */
export type SettingsTab = { id: string; title: string; icon: LucideIcon; element: ReactNode }

// Home and Content are where a session starts; everything else loads the first time it is opened.
const ApiKeys = lazy(() => import('@/components/api-keys').then((m) => ({ default: m.ApiKeys })))
const Locales = lazy(() => import('@/components/locales').then((m) => ({ default: m.Locales })))
const Glossary = lazy(() => import('@/components/glossary').then((m) => ({ default: m.Glossary })))
const Releases = lazy(() => import('@/components/releases').then((m) => ({ default: m.Releases })))
const MessageEditor = lazy(() => import('@/components/message-editor').then((m) => ({ default: m.MessageEditor })))
const NewMessage = lazy(() => import('@/components/message-editor').then((m) => ({ default: m.NewMessage })))

const screens: Screen[] = [
  { title: 'Home', url: '/', icon: HouseIcon, element: <Home /> },
  { title: 'Content', url: '/content', icon: MessagesSquareIcon, element: <Content /> },
  { title: 'New message', url: '/content/new', icon: MessagesSquareIcon, element: <NewMessage />, role: 'MANAGER', hidden: true },
  { title: 'Message', url: '/content/:resource', icon: MessagesSquareIcon, element: <MessageEditor />, hidden: true },
  { title: 'Locales', url: '/locales', icon: LanguagesIcon, element: <Locales />, role: 'MANAGER' },
  { title: 'Glossary', url: '/glossary', icon: BookOpenIcon, element: <Glossary />, role: 'MANAGER' },
  { title: 'Releases', url: '/releases', icon: RocketIcon, element: <Releases />, role: 'MANAGER' },
  { title: 'API keys', url: '/keys', icon: KeyRoundIcon, element: <ApiKeys />, role: 'MANAGER' },
]

/**
 * The one permission gate of the frontend: the screens the caller may open on the selected project. The sidebar lists exactly these and the router routes exactly these, so a screen
 * without the role is neither shown nor reachable — its URL is a 404 like any other. The server
 * still decides; this only keeps the UI from offering what it would refuse.
 */
export function useScreens() {
  const { project } = useProject()
  return screens.filter((s) => !s.role || (project && covers(project.role, s.role)))
}
