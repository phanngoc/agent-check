import { Component, For, Show } from "solid-js";
import { ContainerCard } from "@/components/ContainerCard";
import { useContainers } from "@/stores/containers";

export const Containers: Component = () => {
  const { containers, startContainer, stopContainer, restartContainer } = useContainers();

  const handleViewLogs = async (id: string, name: string) => {
    // Container logs will be handled in Home page modal
    console.log("View container logs:", id, name);
  };

  return (
    <div class="container mx-auto p-6">
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
                onViewLogs={handleViewLogs}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

