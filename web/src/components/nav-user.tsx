import type { Me } from "@/lib/me"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ChevronsUpDownIcon } from "lucide-react"

export function NavUser({ user }: { user: Me }) {
  const { isMobile } = useSidebar()
  const label = user.name || user.email
  const initials = label
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <SidebarMenu>
      {/* Flash's logout route is a POST. A real form submit lets the browser follow its redirect
          to the provider's end-session endpoint; fetch() would follow it invisibly and leave the
          Keycloak session standing. */}
      <form id="logout" method="POST" action="/auth/logout" hidden />
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="aria-expanded:bg-sidebar-accent h-auto gap-3 rounded-2xl px-2 py-2" />
            }
          >
            <Avatar className="size-9">
              <AvatarFallback className="text-on-tint font-heading bg-[var(--lang-3)] text-[13px] font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{label}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
            <ChevronsUpDownIcon className="text-muted-foreground ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-60"
            side={isMobile ? "bottom" : "top"}
            align="start"
            sideOffset={8}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
              <p className="truncate px-3 pb-2 text-sm font-semibold">{user.email}</p>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => (document.getElementById('logout') as HTMLFormElement).requestSubmit()}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
