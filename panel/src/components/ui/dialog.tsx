import { type Component, type JSX, Show, splitProps } from "solid-js";
import { cn } from "@/lib/utils";

export interface DialogProps extends JSX.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const Dialog: Component<DialogProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "open", "onOpenChange"]);
  
  return (
    <Show when={local.open}>
      <div
        class={cn("fixed inset-0 z-50 flex items-center justify-center", local.class)}
        onClick={() => local.onOpenChange?.(false)}
        {...others}
      />
    </Show>
  );
};

const DialogContent: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  
  return (
    <div
      class={cn(
        "relative z-50 grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg",
        local.class
      )}
      onClick={(e) => e.stopPropagation()}
      {...others}
    >
      {local.children}
    </div>
  );
};

const DialogHeader: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div
      class={cn("flex flex-col space-y-1.5 text-center sm:text-left", local.class)}
      {...others}
    />
  );
};

const DialogTitle: Component<JSX.HTMLAttributes<HTMLHeadingElement>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <h2
      class={cn("text-lg font-semibold leading-none tracking-tight", local.class)}
      {...others}
    />
  );
};

const DialogDescription: Component<JSX.HTMLAttributes<HTMLParagraphElement>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <p
      class={cn("text-sm text-muted-foreground", local.class)}
      {...others}
    />
  );
};

export interface DialogCloseProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  onClose?: () => void;
}

const DialogClose: Component<DialogCloseProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "onClose"]);
  
  return (
    <button
      class={cn("absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", local.class)}
      onClick={local.onClose}
      {...others}
    >
      ×
    </button>
  );
};

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose };

