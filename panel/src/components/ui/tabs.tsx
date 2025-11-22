import { type Component, type JSX, createSignal, splitProps, Show, createContext, useContext } from "solid-js";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: () => string;
  setValue: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue>();

export interface TabsProps extends JSX.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const Tabs: Component<TabsProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "defaultValue", "value", "onValueChange", "children"]);
  const [internalValue, setInternalValue] = createSignal(local.defaultValue || local.value || "");
  const isControlled = () => local.value !== undefined;
  const value = () => isControlled() ? local.value! : internalValue();
  
  const setValue = (newValue: string) => {
    if (!isControlled()) {
      setInternalValue(newValue);
    }
    local.onValueChange?.(newValue);
  };
  
  const contextValue: TabsContextValue = {
    value,
    setValue,
  };
  
  return (
    <TabsContext.Provider value={contextValue}>
      <div class={cn("w-full", local.class)} {...others}>
        {local.children}
      </div>
    </TabsContext.Provider>
  );
};

const TabsList: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div
      class={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        local.class
      )}
      {...others}
    />
  );
};

export interface TabsTriggerProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger: Component<TabsTriggerProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "value"]);
  const context = useContext(TabsContext);
  
  if (!context) {
    throw new Error("TabsTrigger must be used within Tabs");
  }
  
  const isActive = () => context.value() === local.value;
  
  return (
    <button
      type="button"
      class={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isActive() ? "bg-background text-foreground shadow-sm" : "hover:bg-background/50",
        local.class
      )}
      onClick={() => context.setValue(local.value)}
      {...others}
    />
  );
};

const TabsContent: Component<JSX.HTMLAttributes<HTMLDivElement> & { value: string }> = (props) => {
  const [local, others] = splitProps(props, ["class", "value", "children"]);
  const context = useContext(TabsContext);
  
  if (!context) {
    throw new Error("TabsContent must be used within Tabs");
  }
  
  const isActive = () => context.value() === local.value;
  
  return (
    <Show when={isActive()}>
      <div
        class={cn(
          "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          local.class
        )}
        {...others}
      >
        {local.children}
      </div>
    </Show>
  );
};

export { Tabs, TabsList, TabsTrigger, TabsContent };
