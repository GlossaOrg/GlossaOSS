import { useState } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router'
import { SettingsIcon, SparklesIcon, UsersIcon } from 'lucide-react'
import { AiFeatures } from '@/components/ai'
import { Logo } from '@/components/logo'
import { NavUser } from '@/components/nav-user'
import { SettingsDialog } from '@/components/settings'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Users } from '@/components/users'
import { useMe } from '@/lib/me'
import { useProject } from '@/lib/projects'
import { useScreens } from '@/screens'

/** Where you are: the project, the screen, and the one below it. The sidebar lists the screens. */
function Crumbs() {
  const { project } = useProject()
  const screens = useScreens()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const screen = screens.find((s) => matchPath(s.url, pathname))
  // One message is still Content: the crumb names the entry it sits under.
  const entry = screen?.hidden ? screens.find((s) => !s.hidden && s.url !== '/' && pathname.startsWith(s.url)) : screen

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm font-semibold md:flex">
      {/* Switching project is the sidebar's job, including on phones. */}
      <span className="text-muted-foreground truncate">{project?.name ?? 'No project'}</span>
      {entry && (
        <>
          <span className="text-muted-foreground/50">/</span>
          {/* The screen a message sits under is the way back: no button repeats it. */}
          {screen === entry ? (
            <span className="truncate">{entry.title}</span>
          ) : (
            <>
              <button type="button" onClick={() => navigate(entry.url)} className="hover:text-foreground text-muted-foreground cursor-pointer truncate">
                {entry.title}
              </button>
              <span className="text-muted-foreground/50">/</span>
              <span className="truncate">{screen!.title}</span>
            </>
          )}
        </>
      )}
    </nav>
  )
}

/** Where you are on the left; on the right, what belongs to the whole install and to you. On phones, the sidebar's handle. */
export function SiteHeader() {
  const { data: me } = useMe()
  const [settings, setSettings] = useState(false)

  return (
    <header className="bg-background/90 sticky top-0 z-10 shrink-0 px-4 backdrop-blur-md md:px-6">
      {/* The page's own column, so the breadcrumb and the actions line up with the content below. */}
      <div className="page flex h-14 items-center gap-3">
      <SidebarTrigger className="-ml-1 md:hidden" />
      <Logo className="h-4.5 md:hidden" />
      <Crumbs />
      <span className="ml-auto" />
      {me?.admin && (
        <>
          <Button variant="outline" size="icon" aria-label="Settings" onClick={() => setSettings(true)}>
            <SettingsIcon />
          </Button>
          <SettingsDialog
            title="Settings"
            description="Accounts and AI for this server."
            tabs={[
              { id: 'users', title: 'Users', icon: UsersIcon, element: <Users /> },
              { id: 'ai', title: 'AI', icon: SparklesIcon, element: <AiFeatures /> },
            ]}
            open={settings}
            onOpenChange={setSettings}
          />
        </>
      )}
      {me && <NavUser user={me} />}
      </div>
    </header>
  )
}
