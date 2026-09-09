import { create } from 'zustand'

/**
 * What the user is currently looking at. Held in a store rather than in the URL or in React
 * state because nearly every screen is scoped to one project and one target locale (§5), and
 * the editor, the review queue and the glossary all read the same pair.
 */
type Workspace = {
  projectId: string | null
  locale: string | null
  select: (projectId: string | null, locale: string | null) => void
}

export const useWorkspace = create<Workspace>((set) => ({
  projectId: null,
  locale: null,
  select: (projectId, locale) => set({ projectId, locale }),
}))
