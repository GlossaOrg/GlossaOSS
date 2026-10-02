import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Logo } from '@/components/logo'
import { cn } from 'cn'
import { Flag, languageName, tint } from '@/components/locale'

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

/**
 * The pitch, on the pastel of a language that changes every few seconds: the word turns through the
 * languages, the field behind it follows, and their flags light up in turn below.
 */
function Pitch() {
  const still = useReducedMotion()
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (still) return
    const timer = setInterval(() => setAt((i) => (i + 1) % words.length), 2400)
    return () => clearInterval(timer)
  }, [still])
  const [word, tag] = words[at]

  return (
    <section
      className="text-on-tint -mx-6 -mt-6 flex flex-col justify-between gap-12 p-6 transition-colors duration-700 md:-mx-10 md:-mt-10 md:p-10 lg:m-0 lg:p-14"
      style={{ backgroundColor: tint(tag) }}
    >
      <Logo className="h-7 self-start" />
      <p className="font-heading text-[clamp(2.5rem,5.4vw,5rem)] leading-[1.02] font-semibold tracking-[-0.05em]">
        Write it once.
        <br />
        Ship it in
        <br />
        <motion.span
          layout
          transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
          className="inline-flex items-center gap-[0.22em] overflow-hidden rounded-[0.2em] bg-white px-[0.3em] pt-[0.02em] pb-[0.14em] leading-[1.1] whitespace-nowrap shadow-[0_8px_30px_-12px_rgb(0_0_0/0.25)]"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={word}
              layout="position"
              className="inline-flex items-center gap-[0.22em]"
              dir={tag === 'ar' ? 'rtl' : undefined}
              initial={{ y: '0.6em', opacity: 0, filter: 'blur(6px)' }}
              animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: '-0.6em', opacity: 0, filter: 'blur(6px)' }}
              transition={{ duration: 0.26, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <Flag locale={tag} className="size-[0.62em] translate-y-[0.04em]" />
              {word}
            </motion.span>
          </AnimatePresence>
        </motion.span>
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-1.5">
          {words.map(([, t], i) => (
            <button key={t} type="button" aria-label={languageName(t)} aria-pressed={i === at} onClick={() => setAt(i)} className="cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
              <Flag locale={t} className={cn('size-6 transition-[opacity,filter,transform] duration-300', i === at ? 'scale-125' : 'opacity-40 grayscale hover:opacity-90 hover:grayscale-0')} />
            </button>
          ))}
        </span>
        <span className="eyebrow text-on-tint/60">Translation management, self-hosted</span>
      </div>
    </section>
  )
}

/** The page every account flow happens on — signing in, and taking an invitation up. */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col gap-14 p-6 md:p-10 lg:grid lg:grid-cols-[1.15fr_1fr] lg:gap-0 lg:p-0">
      <Pitch />
      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-sm lg:self-center lg:justify-self-center"
      >
        <h3 className="mb-2 text-[1.75rem] tracking-[-0.035em]">{title}</h3>
        {children}
      </motion.main>
    </div>
  )
}
