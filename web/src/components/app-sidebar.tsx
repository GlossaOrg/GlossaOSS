import type { Me } from '@/lib/me'
import { useState } from 'react'
import { SettingsIcon, SparklesIcon, UsersIcon } from 'lucide-react'
import { NavMain } from '@/components/nav-main'
import { AiFeatures } from '@/components/ai'
import { SettingsDialog } from '@/components/settings'
import { Users } from '@/components/users'
import { plugin } from '@/plugin'
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { useProject } from '@/lib/projects'
import { useScreens } from '@/screens'
import { NavUser } from '@/components/nav-user'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'

/** shadcn's sidebar-07: project switcher, screens, and the signed-in user. */
export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: Me }) {
  const [settings, setSettings] = useState(false)
  const { project } = useProject()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        {plugin.switcher ?? <WorkspaceSwitcher />}
      </SidebarHeader>
      <SidebarContent>
        {/* Named after the project the screens are scoped to, so the nav never claims a scope it is not in. */}
        <NavMain label={project?.name} screens={useScreens()} />
        {user.admin && (
          <SidebarGroup className="mt-auto">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Settings"
                  onClick={() => setSettings(true)}
                  className="link-bg-animated h-9 rounded-lg px-3 motion-safe:hover:[&_svg]:animate-[shake_0.45s_ease-in-out]"
                >
                  <SettingsIcon />
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
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
