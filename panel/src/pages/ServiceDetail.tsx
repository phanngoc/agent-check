import { Component, Show, createSignal, createEffect } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricsDisplay } from "@/components/MetricsDisplay";
import { LogViewer } from "@/components/LogViewer";
import { useServices } from "@/stores/services";
import type { Service } from "@/types";
import * as api from "@/api/client";

export const ServiceDetail: Component = () => {
  const params = useParams();
  const navigate = useNavigate();
  const { services, metrics, loadServiceMetrics } = useServices();
  const [service, setService] = createSignal<Service | null>(null);

  createEffect(async () => {
    if (params.id) {
      try {
        const data = await api.getService(params.id);
        setService(data);
        if (data.status === "running") {
          loadServiceMetrics(params.id);
        }
      } catch (e) {
        console.error("Failed to load service:", e);
      }
    }
  });

  const currentService = () => {
    const serviceList = services();
    return serviceList.find((s) => s.id === params.id) || service();
  };

  return (
    <div class="container mx-auto p-6 space-y-6">
      <div class="flex items-center gap-4 pb-6 border-b">
        <Button variant="secondary" onClick={() => navigate("/")}>
          ← Back
        </Button>
        <h2 class="text-2xl font-bold">{currentService()?.name || "Service Details"}</h2>
      </div>

      <Show when={currentService()} fallback={<div>Loading...</div>}>
        {(service) => (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Service Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div class="text-sm text-muted-foreground mb-1">ID:</div>
                    <div class="font-mono text-sm">{service().id}</div>
                  </div>
                  <div>
                    <div class="text-sm text-muted-foreground mb-1">Name:</div>
                    <div>{service().name}</div>
                  </div>
                  <div>
                    <div class="text-sm text-muted-foreground mb-1">Type:</div>
                    <div>{service().service_type}</div>
                  </div>
                  <div>
                    <div class="text-sm text-muted-foreground mb-1">Status:</div>
                    <Badge variant={service().status === "running" ? "default" : "destructive"}>
                      {service().status}
                    </Badge>
                  </div>
                  <div>
                    <div class="text-sm text-muted-foreground mb-1">Command:</div>
                    <code class="text-sm bg-muted px-2 py-1 rounded">{service().command}</code>
                  </div>
                  <div>
                    <div class="text-sm text-muted-foreground mb-1">Working Directory:</div>
                    <code class="text-sm bg-muted px-2 py-1 rounded">{service().working_dir}</code>
                  </div>
                  <div>
                    <div class="text-sm text-muted-foreground mb-1">Port:</div>
                    <div>{service().port || "N/A"}</div>
                  </div>
                  <div>
                    <div class="text-sm text-muted-foreground mb-1">Auto Restart:</div>
                    <div>{service().auto_restart ? "Yes" : "No"}</div>
                  </div>
                  <div>
                    <div class="text-sm text-muted-foreground mb-1">Restart Count:</div>
                    <div>{service().restart_count}</div>
                  </div>
                  <div>
                    <div class="text-sm text-muted-foreground mb-1">Created At:</div>
                    <div>{new Date(service().created_at).toLocaleString()}</div>
                  </div>
                  <div>
                    <div class="text-sm text-muted-foreground mb-1">Updated At:</div>
                    <div>{new Date(service().updated_at).toLocaleString()}</div>
                  </div>
                  <div class="md:col-span-2">
                    <div class="text-sm text-muted-foreground mb-1">Environment Variables:</div>
                    <code class="text-sm bg-muted px-2 py-1 rounded block">
                      {Object.entries(service().environment || {})
                        .map(([k, v]) => `${k}=${v}`)
                        .join(", ") || "None"}
                    </code>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <MetricsDisplay metrics={metrics()[service().id]} showPid />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <LogViewer serviceId={service().id} />
              </CardContent>
            </Card>
          </>
        )}
      </Show>
    </div>
  );
};

