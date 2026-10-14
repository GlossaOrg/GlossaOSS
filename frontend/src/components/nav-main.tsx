import { motion, useReducedMotion } from 'motion/react'
import { NavLink, useLocation } from 'react-router'
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import type { Screen } from '@/screens'

/**
 * A sidebar entry. The current one's blue fill is `Pill`, which slides between entries. Every state
 * names `data-active` explicitly, so the menu button's own hover and active fills never paint over the pill.
 */
export const navItem =
  'relative isolate h-10 gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground active:bg-secondary data-active:bg-transparent data-active:text-foreground data-active:hover:bg-transparent data-active:active:bg-transparent [&>svg]:size-[1.0625rem] '

function Pill() {
  const still = useReducedMotion()
  return <motion.span layoutId="nav-pill" aria-hidden className="bg-brand/50 absolute inset-0 -z-10 rounded-md" transition={{ duration: still ? 0 : 0.18, ease: [0.2, 0.7, 0.2, 1] }} />
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
      <SidebarMenu className="gap-1">
        {screens.filter((screen) => !screen.hidden).map((item) => (
          <SidebarMenuItem key={item.url} className={item.url === '/' ? 'mb-2 border-b pb-3' : undefined}>
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
