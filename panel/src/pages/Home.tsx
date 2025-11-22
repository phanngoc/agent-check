import { Component, For, Show, createSignal } from "solid-js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ServiceCard } from "@/components/ServiceCard";
import { ContainerCard } from "@/components/ContainerCard";
import { CombinedLogs } from "@/components/CombinedLogs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { LogViewer } from "@/components/LogViewer";
import { useServices } from "@/stores/services";
import { useContainers } from "@/stores/containers";
import { useSystemMetrics } from "@/stores/system";
import { useNavigate } from "@solidjs/router";

export const Home: Component = () => {
  const navigate = useNavigate();
  const [logModalOpen, setLogModalOpen] = createSignal(false);
  const [logModalServiceId, setLogModalServiceId] = createSignal<string | null>(null);
  const [logModalServiceName, setLogModalServiceName] = createSignal<string>("");
  const [logModalContainerName, setLogModalContainerName] = createSignal<string>("");

  const { services, metrics, startService, stopService, restartService } = useServices();
  const { containers, startContainer, stopContainer, restartContainer } = useContainers();
  const { metrics: systemMetrics } = useSystemMetrics();

  const handleViewLogs = (id: string, name: string) => {
    setLogModalServiceId(id);
    setLogModalServiceName(name);
    setLogModalContainerName("");
    setLogModalOpen(true);
  };

  const handleViewContainerLogs = async (_id: string, name: string) => {
    setLogModalServiceId(null);
    setLogModalServiceName("");
    setLogModalContainerName(name);
    setLogModalOpen(true);
  };

  const handleViewDetails = (id: string) => {
    navigate(`/services/${id}`);
  };

  return (
    <div class="container mx-auto p-6 space-y-6">
      <header class="flex justify-between items-center pb-6 border-b">
        <h1 class="text-3xl font-bold">🚀 Process Manager Panel</h1>
        <div class="flex items-center gap-4">
          <Button
            variant="secondary"
            onClick={() => {
              window.location.reload();
            }}
          >
            🔄 Refresh
          </Button>
          <Show when={systemMetrics()}>
            <div class="flex gap-4 text-sm">
              <div class="px-3 py-2 rounded-md border bg-card">
                <div class="text-muted-foreground text-xs">CPU</div>
                <div class="font-semibold">{systemMetrics()?.cpu_usage.toFixed(1)}%</div>
              </div>
              <div class="px-3 py-2 rounded-md border bg-card">
                <div class="text-muted-foreground text-xs">Memory</div>
                <div class="font-semibold">{systemMetrics()?.memory_usage_percent.toFixed(1)}%</div>
              </div>
              <div class="px-3 py-2 rounded-md border bg-card">
                <div class="text-muted-foreground text-xs">Processes</div>
                <div class="font-semibold">{Math.round(systemMetrics()?.process_count || 0)}</div>
              </div>
            </div>
          </Show>
        </div>
      </header>

      <CombinedLogs />

      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="containers">Docker Containers</TabsTrigger>
        </TabsList>

        <TabsContent value="services">
          <Show
            when={services().length > 0}
            fallback={
              <div class="text-center py-12 text-muted-foreground">
                <div class="text-6xl mb-4">📦</div>
                <p>No services detected</p>
              </div>
            }
          >
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <For each={services()}>
                {(service) => (
                  <ServiceCard
                    service={service}
                    metrics={metrics()[service.id]}
                    onStart={startService}
                    onStop={stopService}
                    onRestart={restartService}
                    onViewLogs={handleViewLogs}
                    onViewDetails={handleViewDetails}
                  />
                )}
              </For>
            </div>
          </Show>
        </TabsContent>

        <TabsContent value="containers">
          <Show
            when={containers().length > 0}
            fallback={
              <div class="text-center py-12 text-muted-foreground">
                <div class="text-6xl mb-4">🐳</div>
                <p>No containers found</p>
              </div>
            }
          >
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <For each={containers()}>
                {(container) => (
                  <ContainerCard
                    container={container}
                    onStart={startContainer}
                    onStop={stopContainer}
                    onRestart={restartContainer}
                    onViewLogs={handleViewContainerLogs}
                  />
                )}
              </For>
            </div>
          </Show>
        </TabsContent>
      </Tabs>

      <Dialog open={logModalOpen()} onOpenChange={setLogModalOpen}>
        <DialogContent class="max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {logModalServiceId() ? `Logs: ${logModalServiceName()}` : `Logs: ${logModalContainerName()}`}
            </DialogTitle>
            <DialogClose onClose={() => setLogModalOpen(false)} />
          </DialogHeader>
          <div class="flex-1 overflow-hidden">
            <Show
              when={logModalServiceId()}
              fallback={
                <div class="p-4 font-mono text-sm">
                  Container logs viewer will be implemented here
                </div>
              }
            >
              <LogViewer serviceId={logModalServiceId() || null} onClose={() => setLogModalOpen(false)} />
            </Show>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

