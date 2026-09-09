import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'

type Health = { service: string; version: string; status: string }

/**
 * Placeholder shell. It exists so the whole stack — Vite alias, Tailwind, a shadcn component,
 * Motion, TanStack Query and the dev-server proxy to the Flash backend — is exercised by
 * `pnpm build` and visibly working before any real screen is built on top of it.
 */
export default function App() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/healthz'),
  })

  return (
    <main className="grid min-h-svh place-items-center p-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="w-80">
          <CardHeader>
            <CardTitle>Glossa</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {isPending && 'Connecting to the backend…'}
            {isError && 'Backend unreachable.'}
            {data && `${data.service} ${data.version} — ${data.status}`}
          </CardContent>
        </Card>
      </motion.div>
    </main>
  )
}
