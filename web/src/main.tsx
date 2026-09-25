import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { BrowserRouter } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'
import App from './App.tsx'

// A refusal is an answer, not a hiccup: only a failed connection or a 5xx is worth asking again.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: (failures, error) => failures < 3 && !((error as { status?: number }).status! < 500) } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider>
          <MotionConfig reducedMotion="user">
            <App />
            <Toaster position="bottom-right" />
          </MotionConfig>
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
