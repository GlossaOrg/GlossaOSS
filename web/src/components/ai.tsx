import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/sonner'
import { Splash } from '@/components/splash'
import { api } from '@/lib/api'
import { useAi, type AiProvider } from '@/lib/ai'

const fields = [
  { name: 'baseUrl', label: 'Provider URL', placeholder: 'https://openrouter.ai/api/v1', type: 'url' },
  { name: 'model', label: 'Model', placeholder: 'openai/gpt-4o-mini', type: 'text' },
] as const

/** §9 for the whole server: one provider, and whether anybody may use it. */
export function AiFeatures() {
  const queries = useQueryClient()
  const provider = useQuery({ queryKey: ['ai', 'provider'], queryFn: () => api<AiProvider>('/api/ai/provider') })
  const available = useAi().data?.available
  const [form, setForm] = useState({ enabled: false, baseUrl: '', model: '', apiKey: '' })
  const [problem, setProblem] = useState<string | null>(null)

  // The key is never sent back, so its field starts empty and an empty field keeps what is stored.
  useEffect(() => {
    const saved = provider.data
    if (saved) setForm({ enabled: saved.enabled, baseUrl: saved.baseUrl ?? '', model: saved.model ?? '', apiKey: '' })
  }, [provider.data])

  const save = useMutation({
    mutationFn: (next: typeof form) => api<AiProvider>('/api/ai/provider', { method: 'PUT', json: { ...next, apiKey: next.apiKey || null } }),
    onMutate: () => setProblem(null),
    onSuccess: (saved) => {
      queries.invalidateQueries({ queryKey: ['ai'] })
      toast.success(saved.enabled ? 'AI features are on.' : 'AI features are off.')
    },
    onError: (error) => setProblem((error as { detail?: string }).detail ?? 'Something went wrong.'),
  })

  if (provider.isPending) return <Splash>Loading…</Splash>

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-14">
      <section className="grid max-w-md content-start gap-6">
        <div className="flex items-start justify-between gap-6 rounded-xl border p-4">
          <div className="grid gap-1">
            <p className="font-medium">AI features</p>
            <p className="text-muted-foreground text-sm">Translators can ask for a suggestion.</p>
          </div>
          <Switch
            checked={form.enabled}
            disabled={save.isPending}
            onCheckedChange={(enabled) => {
              setForm({ ...form, enabled })
              save.mutate({ ...form, enabled })
            }}
          />
        </div>

        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate(form)
          }}
        >
          <p className="text-muted-foreground text-sm">Any service with an OpenAI-compatible API.</p>
          {fields.map((field) => (
            <label key={field.name} className="grid gap-1.5 text-sm font-medium">
              {field.label}
              <Input
                required
                type={field.type}
                placeholder={field.placeholder}
                value={form[field.name]}
                onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
              />
            </label>
          ))}
          <label className="grid gap-1.5 text-sm font-medium">
            API key
            <Input
              type="password"
              required={!provider.data?.configured}
              placeholder={provider.data?.configured ? 'Saved. Type to replace it.' : ''}
              value={form.apiKey}
              onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
            />
            <span className="text-muted-foreground text-xs font-normal">Stored encrypted. It is never shown again.</span>
          </label>

          {problem && (
            <p role="status" className="text-destructive text-sm">
              {problem}
            </p>
          )}

          <Button type="submit" className="justify-self-start" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            Save
          </Button>
        </form>
      </section>

      <aside className="grid content-start gap-6 lg:pt-1">
        <p className={cn('flex items-center gap-2 text-sm font-medium', available ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
          <span className={cn('size-2 rounded-full', available ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
          {available ? 'Suggestions are on.' : 'Suggestions are off.'}
        </p>
        <div className="grid gap-2">
          <h3 className="font-medium">What it does</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            A translator asks for a suggestion on one message and gets it back to accept, change or drop. Nothing is saved
            until they save it, and it counts as their own change.
          </p>
        </div>
        <div className="grid gap-2">
          <h3 className="font-medium">What it costs</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your provider charges for every suggestion. The glossary and the message context are sent with it so the answer
            is worth the call.
          </p>
        </div>
      </aside>
    </div>
  )
}
