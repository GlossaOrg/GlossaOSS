import { Toaster as Sonner, type ToasterProps } from "sonner"

export { toast } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = (props: ToasterProps) => (
  <Sonner
    className="toaster group"
    icons={{
      success: (
        <CircleCheckIcon className="size-4" />
      ),
      info: (
        <InfoIcon className="size-4" />
      ),
      warning: (
        <TriangleAlertIcon className="size-4" />
      ),
      error: (
        <OctagonXIcon className="size-4" />
      ),
      loading: (
        <Loader2Icon className="size-4 animate-spin" />
      ),
    }}
    style={
      {
        "--normal-bg": "var(--primary)",
        "--normal-text": "var(--primary-foreground)",
        "--normal-border": "transparent",
        "--border-radius": "10px",
      } as React.CSSProperties
    }
    toastOptions={{
      classNames: {
        toast: "cn-toast",
      },
    }}
    {...props}
  />
)

export { Toaster }
