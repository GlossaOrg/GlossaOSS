import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { Flag } from '@/components/locale'
import { useLocales } from '@/lib/content'
import { useProject } from '@/lib/projects'
import { useWorkspace } from '@/store/workspace'

/** The project the rest of the app is scoped to (§5), wearing the flags of the languages it speaks. */
export function WorkspaceSwitcher() {
  const { projects, project } = useProject()
  const select = useWorkspace((state) => state.select)
  const loaded = useLocales(project?.id ?? 0).data
  const locales = loaded ?? []

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="bg-sidebar-accent hover:bg-accent data-open:bg-accent h-auto gap-3 rounded-lg px-3 py-2.5" />}
          >
            <span className="grid flex-1 gap-1 text-left leading-tight">
              <span className="truncate text-[0.875rem] font-bold">{project?.name ?? 'No project'}</span>
              <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-[12.5px]">
                {locales.length > 0 && (
                  <span className="flex shrink-0">
                    {locales.slice(0, 4).map((l, i) => (
                      <span key={l.locale} className="ring-sidebar -ml-1 flex rounded-full ring-2 first:ml-0" style={{ zIndex: 4 - i }}>
                        <Flag locale={l.locale} className="size-3.5" />
                      </span>
                    ))}
                  </span>
                )}
                {loaded && <span className="truncate">{locales.length === 1 ? '1 language' : `${locales.length} languages`}</span>}
              </span>
            </span>
            <ChevronsUpDownIcon className="text-muted-foreground ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" align="start" side="bottom" sideOffset={6}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Projects</DropdownMenuLabel>
              {projects.data?.length ? (
                projects.data.map((p) => (
                  <DropdownMenuItem key={p.id} onClick={() => select(p.id, null)}>
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.id === project?.id && <CheckIcon className="size-4" />}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No projects yet
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
