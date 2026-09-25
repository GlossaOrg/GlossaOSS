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

/** §8's project roles, lowest first — the same order the server ranks them. */
export const roles: { value: Role; label: string; does: string }[] = [
  { value: 'READER', label: 'Reader', does: "Reads the project's content." },
  { value: 'TRANSLATOR', label: 'Translator', does: 'Proposes changes for review.' },
  { value: 'REVIEWER', label: 'Reviewer', does: 'Approves or rejects proposals, and edits values directly.' },
  { value: 'MANAGER', label: 'Manager', does: 'Everything in the project, keys included.' },
]

/** §8: a role satisfies every requirement its rank covers — the server's `Role.covers`. */
export const covers = (held: Role, required: Role) => ranks.indexOf(held) >= ranks.indexOf(required)
