import { CheckIcon, ChevronsUpDownIcon, LanguagesIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useProject } from '@/lib/projects'
import { useWorkspace } from '@/store/workspace'

/** The brand, and the project the rest of the app is scoped to (§5). */
export function WorkspaceSwitcher() {
  const { isMobile } = useSidebar()
  const { projects, project } = useProject()
  const select = useWorkspace((state) => state.select)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            {/* Their logo sits in a solid brand tile, not as a bare glyph in the text run. */}
            <div className="bg-brand text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg dark:text-black">
              <LanguagesIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold tracking-[-0.02em]">Glossa</span>
              <span className="text-foreground/70 truncate text-xs">
                {project?.name ?? 'No project'}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
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
