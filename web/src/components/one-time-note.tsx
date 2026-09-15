import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The one place a secret is ever shown — a token, an invitation link — on the yellow paper the rest
 * of the app keeps its sticky notes on. Closing it drops the last copy the browser holds.
 */
export function OneTimeNote({ title, secret, children, onClose }: { title: string; secret: string; children: React.ReactNode; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  return (
    <motion.section
      aria-live="polite"
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className="mb-12 rounded-[3px] bg-[#fff5a5] p-6 text-stone-900 shadow-[0_1px_1px_rgb(0_0_0/0.05),0_18px_28px_-18px_rgb(110_85_0/0.45)] dark:bg-[#4d4620] dark:text-yellow-50"
    >
      <p className="font-semibold">{title}</p>
      <p className="mb-5 text-sm opacity-75">{children}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 rounded bg-white/65 px-3 py-2 font-mono text-sm break-all dark:bg-black/25">{secret}</code>
        <Button
          onClick={() =>
            navigator.clipboard.writeText(secret).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={String(copied)} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.15 }}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </motion.span>
          </AnimatePresence>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <button type="button" onClick={onClose} className="mt-5 cursor-pointer text-sm font-medium underline decoration-stone-900/30 underline-offset-4 transition-[text-decoration-color] hover:decoration-current dark:decoration-yellow-50/30">
        I saved it
      </button>
    </motion.section>
  )
}
