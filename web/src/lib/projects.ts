import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { plugin } from '@/plugin'
import { useWorkspace } from '@/store/workspace'

export type Role = 'READER' | 'TRANSLATOR' | 'REVIEWER' | 'MANAGER'
export type Project = { id: number; slug: string; name: string; role: Role }

/** The caller's projects, and the selected one — the first, until the user picks another. */
export function useProject() {
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const all = await api<Project[]>('/api/projects')
      return plugin.projects ? plugin.projects(all) : all
    },
  })
  const selected = useWorkspace((state) => state.projectId)
  return { projects, project: projects.data?.find((p) => p.id === selected) ?? projects.data?.[0] }
}

const ranks: Role[] = ['READER', 'TRANSLATOR', 'REVIEWER', 'MANAGER']

/** §8's project roles as sticky-note colours, lowest first — the same order the server ranks them. */
export const roles: { value: Role; label: string; does: string; tint: string }[] = [
  { value: 'READER', label: 'Reader', does: "Reads the project's content.", tint: 'bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-100' },
  { value: 'TRANSLATOR', label: 'Translator', does: 'Proposes changes for review.', tint: 'bg-rose-100 text-rose-900 dark:bg-rose-400/15 dark:text-rose-100' },
  { value: 'REVIEWER', label: 'Reviewer', does: 'Approves or rejects proposals, and edits values directly.', tint: 'bg-violet-100 text-violet-900 dark:bg-violet-400/15 dark:text-violet-100' },
  { value: 'MANAGER', label: 'Manager', does: 'Everything in the project, keys included.', tint: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-100' },
]

/** §8: a role satisfies every requirement its rank covers — the server's `Role.covers`. */
export const covers = (held: Role, required: Role) => ranks.indexOf(held) >= ranks.indexOf(required)
