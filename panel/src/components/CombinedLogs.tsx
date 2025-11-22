import { Component, For, createSignal, onCleanup, createEffect, Show, onMount } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useCombinedLogs } from "@/stores/logs";
import { useServices } from "@/stores/services";
import { cn } from "@/lib/utils";

const getLogLevelColor = (level: string): string => {
  const normalized = level.toLowerCase();
  if (normalized === "error") return "text-destructive";
  if (normalized === "warn") return "text-yellow-500";
  if (normalized === "info") return "text-primary";
  if (normalized === "debug") return "text-muted-foreground";
  return "text-foreground";
};

export const CombinedLogs: Component = () => {
  const [collapsed, setCollapsed] = createSignal(false);
  const [level, setLevel] = createSignal<string>("all");
  const [search, setSearch] = createSignal<string>("");
  const [autoScroll, setAutoScroll] = createSignal<boolean>(true);

  const { logs, loading, error, loadLogs, startStreaming, stopStreaming } = useCombinedLogs();
  const { services } = useServices();

  let logsContainer: HTMLDivElement | undefined;
  let debounceTimer: number | null = null;
  let previousCollapsed: boolean | null = null;
  let isInitialMount = true;

  const getServiceName = (serviceId: string): string => {
    const serviceList = services();
    const service = serviceList.find((s) => s.id === serviceId);
    return service ? service.name : serviceId;
  };

  const applyFilter = async () => {
    const params: any = { lines: 100 };
    if (level() !== "all") params.level = level();
    if (search()) params.search = search();
    await loadLogs(params);
  };

  // Debounced version of applyFilter
  const debouncedApplyFilter = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      applyFilter();
      debounceTimer = null;
    }, 300); // 300ms debounce
  };

  const clearFilter = () => {
    setLevel("all");
    setSearch("");
    // Clear debounce and apply immediately
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    applyFilter();
  };

  const scrollToBottom = () => {
    if (logsContainer && autoScroll()) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  };

  // Only load logs when component is first mounted and not collapsed
  onMount(() => {
    if (!collapsed()) {
      applyFilter();
      startStreaming();
    }
    isInitialMount = false;
  });

  // Track collapsed state changes - only call API when expanding (false -> true)
  createEffect(() => {
    const currentCollapsed = collapsed();
    
    // Skip on initial mount (handled by onMount)
    if (isInitialMount) {
      previousCollapsed = currentCollapsed;
      return;
    }

    // Only trigger when expanding (was collapsed, now not collapsed)
    if (previousCollapsed === true && currentCollapsed === false) {
      applyFilter();
      startStreaming();
    } else if (currentCollapsed === true) {
      // Stop streaming when collapsing
      stopStreaming();
    }

    previousCollapsed = currentCollapsed;
  });

  createEffect(() => {
    scrollToBottom();
  });

  onCleanup(() => {
    stopStreaming();
    // Clear any pending debounce timer
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  });

  const filteredLogs = () => {
    const logList = logs();
    const searchTerm = search().toLowerCase();
    const levelFilter = level();

    if (levelFilter === "all" && !searchTerm) {
      return logList;
    }

    return logList.filter((log) => {
      const matchesLevel = levelFilter === "all" || log.level.toLowerCase() === levelFilter.toLowerCase();
      const matchesSearch = !searchTerm || log.message.toLowerCase().includes(searchTerm);
      return matchesLevel && matchesSearch;
    });
  };

  return (
    <Card class="mb-6">
      <CardHeader
        class="cursor-pointer"
        onClick={() => setCollapsed(!collapsed())}
      >
        <div class="flex justify-between items-center">
          <div>
            <CardTitle>📋 Combined Logs</CardTitle>
            <p class="text-sm text-muted-foreground mt-1">All services logs combined</p>
          </div>
          <Button variant="ghost" size="icon">
            {collapsed() ? "▶" : "▼"}
          </Button>
        </div>
      </CardHeader>
      <Show when={!collapsed()}>
        <CardContent class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">Level:</label>
              <Select
                value={level()}
                onChange={(e) => {
                  setLevel(e.currentTarget.value);
                  // Apply filter immediately for level changes (no debounce needed)
                  if (debounceTimer !== null) {
                    clearTimeout(debounceTimer);
                    debounceTimer = null;
                  }
                  applyFilter();
                }}
              >
                <option value="all">All</option>
                <option value="error">Error</option>
                <option value="warn">Warn</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </Select>
            </div>
            <div class="md:col-span-2">
              <label class="text-sm text-muted-foreground mb-1 block">Search:</label>
              <Input
                type="text"
                placeholder="Search in log messages..."
                value={search()}
                onInput={(e) => {
                  setSearch(e.currentTarget.value);
                  // Debounce search input
                  debouncedApplyFilter();
                }}
              />
            </div>
          </div>
          <div class="flex gap-2">
            <Button onClick={applyFilter}>Apply</Button>
            <Button variant="secondary" onClick={clearFilter}>
              Clear
            </Button>
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="combinedAutoScroll"
                checked={autoScroll()}
                onChange={(e) => setAutoScroll(e.currentTarget.checked)}
                class="rounded"
              />
              <label for="combinedAutoScroll" class="text-sm text-muted-foreground">
                Auto-scroll
              </label>
            </div>
          </div>

          <div
            ref={logsContainer}
            class="max-h-[400px] overflow-auto rounded-md border bg-background p-4 font-mono text-sm"
          >
            {loading() && <div class="text-muted-foreground">Loading logs...</div>}
            {error() && <div class="text-destructive">Error: {error()}</div>}
            {!loading() && !error() && filteredLogs().length === 0 && (
              <div class="text-muted-foreground">No logs available</div>
            )}
            <For each={filteredLogs()}>
              {(log) => {
                const timestamp = new Date(log.timestamp).toLocaleString();
                const serviceName = getServiceName(log.service_id);
                return (
                  <div
                    class={cn(
                      "flex gap-2 py-1 border-b border-border/50 items-start",
                      getLogLevelColor(log.level)
                    )}
                  >
                    <span class="text-muted-foreground min-w-[150px]">[{timestamp}]</span>
                    <span class="bg-primary text-primary-foreground px-2 py-0.5 rounded text-xs font-semibold min-w-[80px] text-center">
                      {serviceName}
                    </span>
                    <span class="font-semibold min-w-[50px]">[{log.level.toUpperCase()}]</span>
                    <span class="flex-1 break-words">{log.message}</span>
                  </div>
                );
              }}
            </For>
          </div>
        </CardContent>
      </Show>
    </Card>
  );
};

