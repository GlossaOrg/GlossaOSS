import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** What an administrator sees: `configured` says a key is stored, which is never sent back. */
export type AiProvider = { enabled: boolean; baseUrl: string | null; model: string | null; configured: boolean }

/**
 * Whether an AI call would be allowed right now, which anybody signed in may read: a screen offers
 * nothing it would then be refused. It is the server's own answer, so it also covers a provider that
 * is off, unconfigured, or out of whatever the caller's plan included.
 */
export function useAi() {
  return useQuery({ queryKey: ['ai'], queryFn: () => api<{ available: boolean }>('/api/ai') })
}
