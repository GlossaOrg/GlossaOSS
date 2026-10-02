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
import { roles, useProject } from '@/lib/projects'
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
            render={<SidebarMenuButton size="lg" className="bg-sidebar-accent hover:bg-accent data-open:bg-accent h-auto gap-3 rounded-xl px-2.5 py-2 shadow-[0_1px_2px_rgb(16_16_24/0.05)] ring-1 ring-sidebar-border" />}
          >
            <span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-lg font-heading text-sm font-extrabold uppercase">
              {project?.name.slice(0, 1) ?? '–'}
            </span>
            <span className="grid flex-1 gap-1 text-left leading-tight">
              <span className="truncate text-sm font-bold">{project?.name ?? 'No project'}</span>
              <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
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
          <DropdownMenuContent className="min-w-64 p-2" align="start" side="bottom" sideOffset={6}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 pt-1 pb-2">Projects</DropdownMenuLabel>
              {projects.data?.length ? (
                projects.data.map((p) => (
                  <DropdownMenuItem key={p.id} className="h-auto py-2" onClick={() => select(p.id, null)}>
                    <span className="bg-secondary grid size-8 shrink-0 place-items-center rounded-lg font-heading text-xs font-extrabold uppercase">{p.name.slice(0, 1)}</span>
                    <span className="grid min-w-0 flex-1 text-left">
                      <span className="truncate font-semibold">{p.name}</span>
                      <span className="text-muted-foreground text-xs">{roles.find((role) => role.value === p.role)?.label}</span>
                    </span>
                    {p.id === project?.id && <CheckIcon className="text-brand-strong size-4" />}
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
