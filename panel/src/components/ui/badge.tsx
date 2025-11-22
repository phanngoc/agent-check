import { type Component, type JSX, splitProps } from "solid-js";
import { cn } from "@/lib/utils";

export interface BadgeProps extends JSX.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

const Badge: Component<BadgeProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "variant"]);
  
  return (
    <div
      class={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80": local.variant === "default" || !local.variant,
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80": local.variant === "secondary",
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80": local.variant === "destructive",
          "text-foreground": local.variant === "outline",
        },
        local.class
      )}
      {...others}
    />
  );
};

export { Badge };

