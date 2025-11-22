import { type Component, type JSX, splitProps } from "solid-js";
import { cn } from "@/lib/utils";

export interface SelectProps extends JSX.SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string;
}

const Select: Component<SelectProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "placeholder", "children"]);
  
  return (
    <select
      class={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        local.class
      )}
      {...others}
    >
      {local.placeholder && <option value="">{local.placeholder}</option>}
      {local.children}
    </select>
  );
};

export { Select };

