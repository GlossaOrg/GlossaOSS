import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The one place a secret is ever shown — a token, an invitation link — in ink, the loudest thing on
 * the page. Closing it drops the last copy the browser holds.
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
      className="bg-primary text-primary-foreground mb-12 rounded-[28px] p-7"
    >
      <p className="font-heading text-xl font-bold tracking-[-0.02em]">{title}</p>
      <p className="mt-1 mb-5 text-sm opacity-70">{children}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="bg-primary-foreground/10 min-w-0 flex-1 rounded-2xl px-4 py-3 font-mono text-sm break-all">{secret}</code>
        <Button
          variant="secondary"
          size="lg"
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
      <button type="button" onClick={onClose} className="decoration-primary-foreground/30 mt-5 cursor-pointer text-sm font-semibold underline underline-offset-4 transition-[text-decoration-color] hover:decoration-current">
        I saved it
      </button>
    </motion.section>
  )
}
