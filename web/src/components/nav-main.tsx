import { motion } from 'motion/react'
import { NavLink, useLocation } from 'react-router'
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import type { Screen } from '@/screens'

/**
 * A sidebar entry: words, no icon. The current one's ink is `Pill`, which slides between entries;
 * the entry itself only turns its text white. Every state names `data-active` explicitly, so hovering
 * the entry just clicked can never paint it back to grey or its text back to black.
 */
export const navItem =
  'relative isolate h-10 rounded-full px-4 text-[15px] font-medium text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground data-active:bg-transparent data-active:font-semibold data-active:text-primary-foreground data-active:hover:bg-transparent data-active:hover:text-primary-foreground data-active:active:bg-transparent'

function Pill() {
  return <motion.span layoutId="nav-pill" aria-hidden className="bg-primary absolute inset-0 -z-10 rounded-full" transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }} />
}

/**
 * Flat by design: every entry has a screen behind it and none has sub-items. It renders whatever
 * slice of `useScreens()` it is given, so a screen the caller may not open is never listed.
 *
 * <p>`NavLink` is rendered *as* the menu button rather than around it — a button inside an anchor
 * is invalid — so the active state is matched here instead of taken from NavLink's render prop.
 */
export function NavMain({ screens }: { screens: Screen[] }) {
  const { pathname } = useLocation()
  // One message is still Content: an entry covers the screens routed beneath it.
  const current = (url: string) => pathname === url || (url !== '/' && pathname.startsWith(`${url}/`))

  return (
    <SidebarGroup>
      <SidebarMenu className="gap-0.5">
        {screens.filter((screen) => !screen.hidden).map((item) => (
          <SidebarMenuItem key={item.url}>
            <SidebarMenuButton isActive={current(item.url)} className={navItem} render={<NavLink to={item.url} />}>
              {current(item.url) && <Pill />}
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
