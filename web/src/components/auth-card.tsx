import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Logo } from '@/components/logo'
import { tint } from '@/components/locale'

/** "Every language", in some of them. Short enough that the pill never wraps at the largest size. */
const words = [
  ['every language', 'en'],
  ['ogni lingua', 'it'],
  ['chaque langue', 'fr'],
  ['jeder Sprache', 'de'],
  ['كل لغة', 'ar'],
  ['cada idioma', 'es'],
  ['elke taal', 'nl'],
  ['cada língua', 'pt'],
]

function Headline() {
  const still = useReducedMotion()
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (still) return
    const timer = setInterval(() => setAt((i) => (i + 1) % words.length), 2400)
    return () => clearInterval(timer)
  }, [still])
  const [word, tag] = words[at]

  return (
    <p className="font-heading text-[clamp(2.5rem,5.6vw,5rem)] leading-[1.02] font-bold tracking-[-0.045em]">
      Write it once.
      <br />
      Ship it in
      <br />
      <span
        className="text-on-tint inline-flex items-center gap-[0.18em] overflow-hidden rounded-[0.26em] px-[0.2em] pb-[0.06em] whitespace-nowrap transition-colors duration-500"
        style={{ backgroundColor: tint(tag) }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={word}
            dir={tag === 'ar' ? 'rtl' : undefined}
            initial={{ y: '0.5em', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '-0.5em', opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {word}
          </motion.span>
        </AnimatePresence>
        <span className="rounded-md bg-black/6 px-[0.4em] py-[0.1em] font-sans text-[0.2em] font-semibold tracking-normal">{tag}</span>
      </span>
    </p>
  )
}

/** The page every account flow happens on — signing in, and taking an invitation up. */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col gap-14 p-6 md:p-10 lg:grid lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:p-14">
      <section className="flex flex-col justify-between gap-12 lg:py-2">
        <Logo className="h-7 self-start" />
        <Headline />
        <span className="hidden lg:block" />
      </section>
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="w-full max-w-sm lg:self-center lg:justify-self-center"
      >
        <h3 className="mb-2 text-[28px]">{title}</h3>
        {children}
      </motion.main>
    </div>
  )
}
