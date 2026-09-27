import { NavMain } from '@/components/nav-main'
import { Logo } from '@/components/logo'
import { plugin } from '@/plugin'
import { useScreens } from '@/screens'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import { Sidebar, SidebarContent, SidebarHeader, SidebarRail } from '@/components/ui/sidebar'

/** The logo, the project and its screens: a white card on the canvas. */
export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" variant="floating" {...props}>
      <SidebarHeader className="gap-5 px-3 pt-5">
        <Logo className="ml-2 h-5 self-start" />
        {plugin.switcher ?? <WorkspaceSwitcher />}
      </SidebarHeader>
      <SidebarContent className="px-1 pt-1">
        <NavMain screens={useScreens()} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
