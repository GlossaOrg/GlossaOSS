import { cn } from "cn"

/** The logo's six dots, taking turns: the one way anything in Glossa waits. */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg data-slot="spinner" role="status" aria-label="Loading" viewBox="0 0 34 22" className={cn("h-4 w-auto", className)} {...props}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle
          key={i}
          cx={5 + (i % 3) * 12}
          cy={5 + Math.floor(i / 3) * 12}
          r="5"
          className="motion-safe:animate-pulse"
          style={{ fill: `var(--lang-${i}-v)`, animationDelay: `${[0, 1, 2, 5, 4, 3][i] * 150}ms` }}
        />
      ))}
    </svg>
  )
}

export { Spinner }
