import { type Component, type JSX, splitProps } from "solid-js";
import { cn } from "@/lib/utils";

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button: Component<ButtonProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "variant", "size"]);
  
  return (
    <button
      class={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        {
          "bg-primary text-primary-foreground hover:bg-primary/90": local.variant === "default" || !local.variant,
          "bg-destructive text-destructive-foreground hover:bg-destructive/90": local.variant === "destructive",
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground": local.variant === "outline",
          "bg-secondary text-secondary-foreground hover:bg-secondary/80": local.variant === "secondary",
          "hover:bg-accent hover:text-accent-foreground": local.variant === "ghost",
          "text-primary underline-offset-4 hover:underline": local.variant === "link",
          "h-10 px-4 py-2": local.size === "default" || !local.size,
          "h-9 rounded-md px-3": local.size === "sm",
          "h-11 rounded-md px-8": local.size === "lg",
          "h-10 w-10": local.size === "icon",
        },
        local.class
      )}
      {...others}
    />
  );
};

export { Button };

