import { motion } from 'motion/react'
import { useLocation, useRoutes } from 'react-router'
import { AppSidebar } from '@/components/app-sidebar'
import { ChangePassword } from '@/components/change-password'
import { SiteHeader } from '@/components/site-header'
import { Invite } from '@/components/invite'
import { returnTo, SignIn } from '@/components/sign-in'
import { Splash } from '@/components/splash'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useMe } from '@/lib/me'
import { useProject } from '@/lib/projects'
import { useScreens } from '@/screens'

/**
 * The dashboard, and the §11 gate in front of it: `/api/me` answers 401 until there is a session,
 * and `SignIn` offers whatever `/auth/methods` lists.
 *
 * <p>The shell below the gate is rendered once and never again: only the matched route swaps, so
 * moving between sidebar entries costs a render, not a page load. Screens are matched here rather
 * than in a layout route because there is exactly one layout and nesting it would buy nothing.
 */
export default function App() {
  const { data: me, error } = useMe()

  const failure = error as { status?: number; detail?: string } | null
  const unauthenticated = failure?.status === 401
  const refused = failure?.status === 403 ? failure.detail : undefined
  const { projects } = useProject()
  const route = useLocation()
  // Screens the caller may not open are not routed at all: their URL falls through to the 404.
  const screen = useRoutes([...useScreens().map((s) => ({ path: s.url, element: s.element })), { path: '*', element: <NotFound /> }], route)

  // The invitation link is its own flow: whoever opens it has no session yet, and needs none.
  if (route.pathname.startsWith('/invite/')) return <Invite token={route.pathname.slice('/invite/'.length)} />
  if (unauthenticated) return <SignIn />
  // A session the server refuses — suspended, removed, or never invited — says so and offers a way out.
  if (refused) return <SignIn refused={refused} />
  if (error || projects.error) return <Splash className="min-h-svh" failed>Backend unreachable.</Splash>
  if (!me || !projects.data) return <Splash className="min-h-svh">Loading…</Splash>
  // A password an administrator retired: nothing else in the app until a new one is chosen.
  if (me.mustChangePassword) return <ChangePassword />
  if (location.pathname === '/login') {
    // Already signed in: `/login` is only ever a stop on the way back to the target.
    location.replace(returnTo())
    return <Splash className="min-h-svh">Redirecting…</Splash>
  }

  return (
    <SidebarProvider style={{ '--sidebar-width': 'calc(var(--spacing) * 64)' } as React.CSSProperties}>
      {/* No `variant="inset"`: that wraps the content area in its own rounded, shadowed panel.
          Sidebar and content sit side by side, neither nested in the other. */}
      <AppSidebar user={me} />
      <SidebarInset>
        <SiteHeader />
        {/* Enter only: waiting for the old screen to fade out before the new one came in read as lag. */}
        <motion.div
          key={route.pathname}
          className="@container/main flex flex-1 flex-col px-5 pt-8 pb-16 md:px-10 md:pt-14 lg:px-16"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
        >
          {screen}
        </motion.div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function NotFound() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center p-10 text-center">
      <p className="text-muted-foreground mb-4">404</p>
      <h2 className="mb-4">No such page</h2>
      <p className="text-muted-foreground text-lg">Check the address, or pick a screen on the left.</p>
    </section>
  )
}
