import { useRef } from 'react'
import { motion } from 'motion/react'
import { LanguagesIcon } from 'lucide-react'
import { Greetings } from '@/components/greetings'

/** The card every account flow happens on — signing in, and taking an invitation up — on its wall of sticky notes. */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  const card = useRef<HTMLElement>(null)

  return (
    <div className="bg-secondary relative isolate grid min-h-svh place-items-center overflow-hidden p-6">
      <Greetings around={card} />
      <motion.main
        ref={card}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="bg-background w-full max-w-sm rounded-2xl p-8 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_48px_-24px_rgb(0_0_0/0.18)]"
      >
        <div className="bg-brand text-primary-foreground mb-6 grid size-10 place-items-center rounded-xl dark:text-black">
          <LanguagesIcon className="size-5" />
        </div>
        <h2 className="mb-1 text-2xl">{title}</h2>
        {children}
      </motion.main>
    </div>
  )
}
