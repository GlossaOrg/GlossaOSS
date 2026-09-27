import type { Me } from '@/lib/me'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** The signed-in user as an avatar in the header; its menu says who you are and logs you out. */
export function NavUser({ user }: { user: Me }) {
  const label = user.name || user.email
  const initials = label
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <>
      {/* Flash's logout route is a POST. A real form submit lets the browser follow its redirect
          to the provider's end-session endpoint; fetch() would follow it invisibly and leave the
          Keycloak session standing. */}
      <form id="logout" method="POST" action="/auth/logout" hidden />
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`Signed in as ${label}`} className="focus-visible:ring-ring/20 cursor-pointer rounded-full outline-none focus-visible:ring-3">
          <Avatar className="size-9">
            <AvatarFallback className="text-on-tint bg-brand text-xs font-bold">{initials}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-60" side="bottom" align="end" sideOffset={8}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
            <p className="truncate px-3 text-sm font-semibold">{label}</p>
            <p className="text-muted-foreground truncate px-3 pb-2 text-xs">{user.email}</p>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => (document.getElementById('logout') as HTMLFormElement).requestSubmit()}>
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
