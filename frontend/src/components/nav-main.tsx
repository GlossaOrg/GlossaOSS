import { motion } from 'motion/react'
import { NavLink, useLocation } from 'react-router'
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import type { Screen } from '@/screens'

/**
 * A sidebar entry. The current one's lilac fill is `Pill`, which slides between entries. Every state
 * names `data-active` explicitly, so the menu button's own hover and active fills never paint over the pill.
 */
export const navItem =
  'relative isolate h-9 gap-2.5 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground active:bg-secondary data-active:bg-transparent data-active:text-foreground data-active:hover:bg-transparent data-active:active:bg-transparent [&>svg]:size-[1.0625rem] motion-safe:hover:[&_svg]:animate-[shake_0.45s_ease-in-out]'

function Pill() {
  return <motion.span layoutId="nav-pill" aria-hidden className="bg-brand absolute inset-0 -z-10 rounded-lg" transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }} />
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
      <SidebarMenu className="gap-px">
        {screens.filter((screen) => !screen.hidden).map((item) => (
          <SidebarMenuItem key={item.url}>
            <SidebarMenuButton isActive={current(item.url)} className={navItem} render={<NavLink to={item.url} />}>
              {current(item.url) && <Pill />}
              <item.icon />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
