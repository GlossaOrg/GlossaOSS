import { useState } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router'
import { cn } from 'cn'
import { CheckIcon, ChevronDownIcon, SettingsIcon, SparklesIcon, UsersIcon } from 'lucide-react'
import { AiFeatures } from '@/components/ai'
import { Logo } from '@/components/logo'
import { NavUser } from '@/components/nav-user'
import { SettingsDialog } from '@/components/settings'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Users } from '@/components/users'
import { useMe } from '@/lib/me'
import { useProject } from '@/lib/projects'
import { useScreens } from '@/screens'
import { useWorkspace } from '@/store/workspace'

const crumb = 'hover:bg-secondary data-popup-open:bg-secondary inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/20 [&>svg]:size-3.5 [&>svg]:opacity-50'

/** The project and the screen, each a menu of the others: one click to switch either. */
function Crumbs() {
  const { projects, project } = useProject()
  const select = useWorkspace((state) => state.select)
  const screens = useScreens()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const screen = screens.find((s) => matchPath(s.url, pathname))
  // One message is still Content: the menu names the entry it sits under.
  const entry = screen?.hidden ? screens.find((s) => !s.hidden && s.url !== '/' && pathname.startsWith(s.url)) : screen

  return (
    <nav aria-label="Breadcrumb" className="-ml-2 hidden min-w-0 items-center text-sm font-semibold md:flex">
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(crumb, 'text-muted-foreground hover:text-foreground')}>
          <span className="truncate">{project?.name ?? 'No project'}</span>
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-52" align="start" sideOffset={6}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            {projects.data?.map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => select(p.id, null)}>
                <span className="flex-1 truncate">{p.name}</span>
                {p.id === project?.id && <CheckIcon className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {entry && (
        <>
          <span className="text-muted-foreground/60 mx-0.5">/</span>
          <DropdownMenu>
            <DropdownMenuTrigger className={crumb}>
              {entry.title}
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-44" align="start" sideOffset={6}>
              {screens.filter((s) => !s.hidden).map((s) => (
                <DropdownMenuItem key={s.url} onClick={() => navigate(s.url)}>
                  <s.icon />
                  <span className="flex-1">{s.title}</span>
                  {s === entry && <CheckIcon className="size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {screen !== entry && <span className="text-muted-foreground/60 mx-0.5">/ <span className="text-foreground ml-1">{screen!.title}</span></span>}
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
