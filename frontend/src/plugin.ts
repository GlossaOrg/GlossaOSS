import type { ReactNode } from 'react'
import type { Project } from '@/lib/projects'
import type { Screen } from '@/screens'

/**
 * The frontend's one extension point. A downstream build aliases `@/plugin` to its own module.
 * Empty here: nothing in this repository populates it.
 */
export type Plugin = {
  screens?: Screen[]
  /** Replaces the sidebar header, for a build with a scope wider than a project. */
  switcher?: ReactNode
  /** Narrows the projects the shell lists. */
  projects?: (projects: Project[]) => Project[]
  /** Another way in, on the sign-in card. */
  signIn?: ReactNode
}

export const plugin: Plugin = {}
