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
import { hue } from '@/components/locale'
import { useLocales } from '@/lib/content'
import { useProject } from '@/lib/projects'
import { useWorkspace } from '@/store/workspace'

/** The project the rest of the app is scoped to (§5), wearing the colours of the languages it speaks. */
export function WorkspaceSwitcher() {
  const { projects, project } = useProject()
  const select = useWorkspace((state) => state.select)
  const locales = useLocales(project?.id ?? 0).data ?? []

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="bg-sidebar-accent hover:bg-sidebar-accent data-open:bg-sidebar-accent h-auto gap-3 rounded-[18px] px-3 py-2.5" />}
          >
            <span className="flex shrink-0">
              {(locales.length ? locales.slice(0, 3) : [{ locale: '' }]).map((l, i) => (
                <span
                  key={l.locale}
                  className="ring-sidebar-accent size-3 rounded-full ring-2 first:ml-0 -ml-1"
                  style={{ background: l.locale ? `var(--lang-${hue(l.locale)}-v)` : 'var(--border)', zIndex: 3 - i }}
                />
              ))}
            </span>
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate text-[14.5px] font-semibold">{project?.name ?? 'No project'}</span>
              <span className="text-muted-foreground truncate text-[12.5px]">
                {locales.length === 1 ? '1 language' : `${locales.length} languages`}
              </span>
            </span>
            <ChevronsUpDownIcon className="text-muted-foreground ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" align="start" side="bottom" sideOffset={6}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs">Projects</DropdownMenuLabel>
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
