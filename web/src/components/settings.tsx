import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SettingsTab } from '@/screens'

export function SettingsDialog({ title, description, icon, tabs, open, onOpenChange }: {
  title: string
  description: string
  icon?: React.ReactNode
  tabs: SettingsTab[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(44rem,90svh)] max-w-5xl flex-col gap-6 p-6 sm:max-w-5xl">
        <DialogHeader className="flex-row items-center gap-3 text-left">
          {icon}
          <div className="grid gap-0.5">
            <DialogTitle className="text-xl">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
        </DialogHeader>
        <Tabs defaultValue={tabs[0].id} className="min-h-0 flex-1">
          <TabsList variant="line" className="-ml-1.5 max-w-full justify-start overflow-x-auto [scrollbar-width:none]">
            {tabs.map(({ id, title, icon: Icon }) => (
              <TabsTrigger key={id} value={id}>
                <Icon />
                {title}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map(({ id, element }) => (
            <TabsContent key={id} value={id} className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 pt-6">
              {element}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
