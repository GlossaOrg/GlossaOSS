import { NavLink, useLocation } from 'react-router'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { Screen } from '@/screens'

/**
 * Flat by design: every entry has a screen behind it and none has sub-items. It renders whatever
 * slice of `useScreens()` it is given, so a screen the caller may not open is never listed.
 *
 * <p>`NavLink` is rendered *as* the menu button rather than around it — a button inside an anchor
 * is invalid — so the active state is matched here instead of taken from NavLink's render prop.
 */
export function NavMain({ label, screens, className }: { label?: string; screens: Screen[]; className?: string }) {
  const { pathname } = useLocation()

  return (
    <SidebarGroup className={className}>
      {label && <SidebarGroupLabel className="eyebrow h-auto truncate px-3 pb-3">{label}</SidebarGroupLabel>}
      <SidebarMenu>
        {screens.filter((screen) => !screen.hidden).map((item) => (
          <SidebarMenuItem key={item.url}>
            <SidebarMenuButton
              isActive={pathname === item.url}
              tooltip={item.title}
              className="link-bg-animated data-active:bg-brand/10 data-active:text-brand h-9 rounded-lg px-3 motion-safe:hover:[&_svg]:animate-[shake_0.45s_ease-in-out]"
              render={<NavLink to={item.url} />}
            >
              <item.icon />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
