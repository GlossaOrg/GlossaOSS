import type { Me } from '@/lib/me'
import { useState } from 'react'
import { SparklesIcon, UsersIcon } from 'lucide-react'
import { NavMain, navItem } from '@/components/nav-main'
import { AiFeatures } from '@/components/ai'
import { Logo } from '@/components/logo'
import { SettingsDialog } from '@/components/settings'
import { Users } from '@/components/users'
import { plugin } from '@/plugin'
import { useScreens } from '@/screens'
import { NavUser } from '@/components/nav-user'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

/** The logo, the project, its screens, and the signed-in user. */
export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: Me }) {
  const [settings, setSettings] = useState(false)

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="gap-6 px-4 pt-6">
        <Logo className="ml-2 h-[26px] self-start" />
        {plugin.switcher ?? <WorkspaceSwitcher />}
      </SidebarHeader>
      <SidebarContent className="px-2 pt-2">
        <NavMain screens={useScreens()} />
        {user.admin && (
          <SidebarGroup className="mt-auto">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setSettings(true)} className={navItem}>
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      {user.admin && (
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
      )}
      <SidebarFooter className="px-4 pb-5">
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
