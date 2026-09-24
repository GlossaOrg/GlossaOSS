import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Me = {
  id: number
  email: string
  name: string
  /** §11's one installation-wide role: it owns what belongs to the install rather than to a project. Project roles arrive with the project. */
  admin: boolean
  /** An administrator retired this account's password: nothing works until a new one is chosen. */
  mustChangePassword: boolean
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/me'),
    // A 401 is an answer, not a hiccup — retrying it only delays the redirect.
    retry: (failureCount, e) => (e as { status?: number }).status !== 401 && failureCount < 2,
  })
}
