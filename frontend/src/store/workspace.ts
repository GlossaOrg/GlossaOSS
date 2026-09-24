import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * What the user is currently looking at. Held in a store rather than in the URL or in React
 * state because nearly every screen is scoped to one project and one target locale (§5), and
 * the editor, the review queue and the glossary all read the same pair. Persisted, so a reload
 * stays in the same project.
 */
type Workspace = {
  projectId: number | null
  locale: string | null
  select: (projectId: number | null, locale: string | null) => void
}

export const useWorkspace = create<Workspace>()(
  persist(
    (set) => ({
      projectId: null,
      locale: null,
      select: (projectId, locale) => set({ projectId, locale }),
    }),
    { name: 'glossa-workspace' },
  ),
)
