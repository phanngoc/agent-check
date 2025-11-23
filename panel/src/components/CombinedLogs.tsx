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
  if (normalized === "warn") return "text-amber-600";
  if (normalized === "info") return "text-primary";
  if (normalized === "debug") return "text-muted-foreground";
  return "text-foreground";
};

// Color palette for different services
const SERVICE_COLORS = [
  { bg: "bg-blue-500", text: "text-white", border: "border-blue-500" },
  { bg: "bg-green-500", text: "text-white", border: "border-green-500" },
  { bg: "bg-purple-500", text: "text-white", border: "border-purple-500" },
  { bg: "bg-orange-500", text: "text-white", border: "border-orange-500" },
  { bg: "bg-pink-500", text: "text-white", border: "border-pink-500" },
  { bg: "bg-cyan-500", text: "text-white", border: "border-cyan-500" },
  { bg: "bg-indigo-500", text: "text-white", border: "border-indigo-500" },
  { bg: "bg-teal-500", text: "text-white", border: "border-teal-500" },
  { bg: "bg-red-500", text: "text-white", border: "border-red-500" },
  { bg: "bg-yellow-500", text: "text-black", border: "border-yellow-500" },
  { bg: "bg-emerald-500", text: "text-white", border: "border-emerald-500" },
  { bg: "bg-violet-500", text: "text-white", border: "border-violet-500" },
];

// Hash function to get consistent color for a service_id
const getServiceColor = (serviceId: string): typeof SERVICE_COLORS[0] => {
  let hash = 0;
  for (let i = 0; i < serviceId.length; i++) {
    hash = serviceId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % SERVICE_COLORS.length;
  return SERVICE_COLORS[index];
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
    // Check if we have filters: level != "all" or search is not empty
    const hasFilter = level() !== "all" || search().trim() !== "";
    
    // Always stop streaming first
    stopStreaming();
    
    if (hasFilter) {
      // Filtered mode: query from TimescaleDB, no streaming
      const params: any = { lines: 100 };
      if (level() !== "all") params.level = level();
      if (search().trim()) params.search = search().trim();
      await loadLogs(params);
      // Don't start streaming for filtered mode
    } else {
      // Realtime mode: get from files, then start streaming
      await loadLogs({ lines: 100 });
      startStreaming();
    }
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
      // On mount, start with realtime mode (no filters)
      stopStreaming();
      loadLogs({ lines: 100 }).then(() => {
        startStreaming();
      });
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
                  // applyFilter will handle realtime vs filtered mode
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
                const serviceColor = getServiceColor(log.service_id);
                return (
                  <div
                    class={cn(
                      "flex gap-2 py-1 border-b border-border/50 items-start border-l-4",
                      getLogLevelColor(log.level),
                      serviceColor.border
                    )}
                  >
                    <span class="text-muted-foreground min-w-[150px]">[{timestamp}]</span>
                    <span class={cn(
                      "px-2 py-0.5 rounded text-xs font-semibold min-w-[80px] text-center",
                      serviceColor.bg,
                      serviceColor.text
                    )}>
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

