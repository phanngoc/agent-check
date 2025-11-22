import { Component, For, createSignal, onCleanup, createEffect } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useServiceLogs } from "@/stores/logs";
import { cn } from "@/lib/utils";

export interface LogViewerProps {
  serviceId: string | null;
  onClose?: () => void;
}

const getLogLevelColor = (level: string): string => {
  const normalized = level.toLowerCase();
  if (normalized === "error") return "text-destructive";
  if (normalized === "warn") return "text-yellow-500";
  if (normalized === "info") return "text-primary";
  if (normalized === "debug") return "text-muted-foreground";
  return "text-foreground";
};

export const LogViewer: Component<LogViewerProps> = (props) => {
  const [level, setLevel] = createSignal<string>("all");
  const [search, setSearch] = createSignal<string>("");
  const [from, setFrom] = createSignal<string>("");
  const [to, setTo] = createSignal<string>("");
  const [operator, setOperator] = createSignal<"and" | "or">("and");
  const [limit, setLimit] = createSignal<number>(1000);
  const [autoScroll, setAutoScroll] = createSignal<boolean>(true);

  const { logs, loading, error, loadLogs, startStreaming, stopStreaming } = useServiceLogs(
    () => props.serviceId
  );

  let logsContainer: HTMLDivElement | undefined;

  const applyFilter = async () => {
    const id = props.serviceId;
    if (!id) return;

    const params: any = {
      limit: limit(),
      operator: operator(),
    };

    if (level() !== "all") params.level = level();
    if (from()) params.from = new Date(from()).toISOString();
    if (to()) params.to = new Date(to()).toISOString();
    if (search()) params.search = search();

    await loadLogs(params);
  };

  const clearFilter = () => {
    setLevel("all");
    setSearch("");
    setFrom("");
    setTo("");
    setOperator("and");
    setLimit(1000);
    applyFilter();
  };

  const scrollToBottom = () => {
    if (logsContainer && autoScroll()) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  };

  createEffect(() => {
    const id = props.serviceId;
    if (id) {
      applyFilter();
      startStreaming();
    } else {
      stopStreaming();
    }
  });

  createEffect(() => {
    scrollToBottom();
  });

  onCleanup(() => {
    stopStreaming();
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
      
      if (operator() === "and") {
        return matchesLevel && matchesSearch;
      } else {
        return matchesLevel || matchesSearch;
      }
    });
  };

  return (
    <Card class="h-full flex flex-col">
      <CardHeader>
        <div class="flex justify-between items-center">
          <CardTitle>Logs</CardTitle>
          {props.onClose && (
            <Button variant="ghost" size="icon" onClick={props.onClose}>
              ×
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent class="flex-1 flex flex-col space-y-4">
        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">Level:</label>
              <Select
                value={level()}
                onChange={(e) => setLevel(e.currentTarget.value)}
              >
                <option value="all">All</option>
                <option value="error">Error</option>
                <option value="warn">Warn</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </Select>
            </div>
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">From:</label>
              <Input
                type="datetime-local"
                value={from()}
                onInput={(e) => setFrom(e.currentTarget.value)}
              />
            </div>
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">To:</label>
              <Input
                type="datetime-local"
                value={to()}
                onInput={(e) => setTo(e.currentTarget.value)}
              />
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div class="md:col-span-2">
              <label class="text-sm text-muted-foreground mb-1 block">Search:</label>
              <Input
                type="text"
                placeholder="Search in log messages..."
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
            </div>
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">Limit:</label>
              <Input
                type="number"
                value={limit()}
                min="1"
                max="10000"
                onInput={(e) => setLimit(parseInt(e.currentTarget.value) || 1000)}
              />
            </div>
          </div>
          <div class="flex gap-2">
            <Button onClick={applyFilter}>Apply Filter</Button>
            <Button variant="secondary" onClick={clearFilter}>
              Clear
            </Button>
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoScroll"
                checked={autoScroll()}
                onChange={(e) => setAutoScroll(e.currentTarget.checked)}
                class="rounded"
              />
              <label for="autoScroll" class="text-sm text-muted-foreground">
                Auto-scroll
              </label>
            </div>
          </div>
        </div>


        <div
          ref={logsContainer}
          class="flex-1 overflow-auto rounded-md border bg-background p-4 font-mono text-sm"
        >
          {loading() && <div class="text-muted-foreground">Loading logs...</div>}
          {error() && <div class="text-destructive">Error: {error()}</div>}
          {!loading() && !error() && filteredLogs().length === 0 && (
            <div class="text-muted-foreground">No logs found</div>
          )}
          <For each={filteredLogs()}>
            {(log) => {
              const timestamp = new Date(log.timestamp).toLocaleString();
              return (
                <div
                  class={cn(
                    "flex gap-2 py-1 border-b border-border/50",
                    getLogLevelColor(log.level)
                  )}
                >
                  <span class="text-muted-foreground min-w-[180px]">[{timestamp}]</span>
                  <span class="font-semibold min-w-[60px]">[{log.level.toUpperCase()}]</span>
                  <span class="flex-1 break-words">{log.message}</span>
                </div>
              );
            }}
          </For>
        </div>
      </CardContent>
    </Card>
  );
};

