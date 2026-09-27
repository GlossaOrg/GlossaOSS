import { useState } from 'react'
import { matchPath, useLocation } from 'react-router'
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

/** Where you are on the left; on the right, what belongs to the whole install and to you. On phones, the sidebar's handle. */
export function SiteHeader() {
  const { data: me } = useMe()
  const { project } = useProject()
  const { pathname } = useLocation()
  const screen = useScreens().find((s) => matchPath(s.url, pathname))
  const [settings, setSettings] = useState(false)

  return (
    <header className="bg-background/90 sticky top-0 z-10 shrink-0 px-4 backdrop-blur-md md:px-6">
      {/* The page's own column, so the breadcrumb and the actions line up with the content below. */}
      <div className="page flex h-14 items-center gap-3">
      <SidebarTrigger className="-ml-1 md:hidden" />
      <Logo className="h-4.5 md:hidden" />
      <p className="text-muted-foreground hidden min-w-0 truncate text-sm font-semibold md:block">
        {project?.name}
        {screen && <span className="text-foreground"> <span className="text-muted-foreground/60 mx-1">/</span> {screen.title}</span>}
      </p>
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
