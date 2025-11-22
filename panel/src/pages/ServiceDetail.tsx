import { Component, Show, createSignal, createEffect, onCleanup } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricsDisplay } from "@/components/MetricsDisplay";
import { LogViewer } from "@/components/LogViewer";
import type { Service, ServiceMetrics } from "@/types";
import * as api from "@/api/client";

export const ServiceDetail: Component = () => {
  const params = useParams();
  const navigate = useNavigate();
  
  // Independent state management
  const [service, setService] = createSignal<Service | null>(null);
  const [serviceMetrics, setServiceMetrics] = createSignal<ServiceMetrics | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [notFound, setNotFound] = createSignal(false);
  const [loadingMetrics, setLoadingMetrics] = createSignal(false);
  const [actionLoading, setActionLoading] = createSignal(false);

  let metricsInterval: number | null = null;

  const loadService = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      setNotFound(false);
      
      const data = await api.getService(id);
      setService(data);
      
      // Load metrics if service is running
      if (data.status === "running") {
        loadMetrics(id);
        // Start auto-refresh for metrics
        startMetricsRefresh(id);
      } else {
        setServiceMetrics(null);
        stopMetricsRefresh();
      }
    } catch (e) {
      console.error("Failed to load service:", e);
      if (e instanceof Error) {
        // Check if it's a 404 error
        if (e.message.includes("404") || e.message.includes("not found")) {
          setNotFound(true);
          setError(null);
        } else {
          setError(e.message || "Failed to load service");
          setNotFound(false);
        }
      } else {
        setError("Failed to load service");
        setNotFound(false);
      }
      setService(null);
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async (id: string) => {
    try {
      setLoadingMetrics(true);
      const metrics = await api.getServiceMetrics(id);
      setServiceMetrics(metrics);
    } catch (e) {
      console.error("Failed to load metrics:", e);
      // Don't set error state for metrics failure, just log it
    } finally {
      setLoadingMetrics(false);
    }
  };

  const startMetricsRefresh = (id: string) => {
    stopMetricsRefresh();
    metricsInterval = setInterval(() => {
      const currentService = service();
      if (currentService && currentService.status === "running") {
        loadMetrics(id);
      } else {
        stopMetricsRefresh();
      }
    }, 5000) as unknown as number;
  };

  const stopMetricsRefresh = () => {
    if (metricsInterval) {
      clearInterval(metricsInterval);
      metricsInterval = null;
    }
  };

  // Load service when params.id changes
  createEffect(() => {
    if (params.id) {
      loadService(params.id);
    }
  });

  // Cleanup on unmount
  onCleanup(() => {
    stopMetricsRefresh();
  });

  const handleRetry = () => {
    if (params.id) {
      loadService(params.id);
    }
  };

  const handleStart = async () => {
    const currentService = service();
    if (!currentService || !params.id) return;

    try {
      setActionLoading(true);
      setError(null);
      await api.startService(params.id);
      // Reload service data after a short delay to allow service to start
      setTimeout(() => {
        loadService(params.id);
      }, 1000);
    } catch (e) {
      console.error("Failed to start service:", e);
      setError(e instanceof Error ? e.message : "Failed to start service");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    const currentService = service();
    if (!currentService || !params.id) return;

    try {
      setActionLoading(true);
      setError(null);
      await api.stopService(params.id);
      // Reload service data after a short delay to allow service to stop
      setTimeout(() => {
        loadService(params.id);
      }, 1000);
    } catch (e) {
      console.error("Failed to stop service:", e);
      setError(e instanceof Error ? e.message : "Failed to stop service");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div class="container mx-auto p-6 space-y-6">
      <div class="flex items-center gap-4 pb-6 border-b">
        <Button variant="secondary" onClick={() => navigate("/")}>
          ← Back
        </Button>
        <h2 class="text-2xl font-bold">
          {service()?.name || "Service Details"}
        </h2>
        <Show when={!loading() && !error() && !notFound() && service()}>
          {(service) => (
            <div class="flex gap-2 ml-auto">
              <Show
                when={service().status === "running"}
                fallback={
                  <Button
                    variant="default"
                    onClick={handleStart}
                    disabled={actionLoading()}
                  >
                    <Show
                      when={actionLoading()}
                      fallback="Start"
                    >
                      <span class="flex items-center gap-2">
                        <span class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                        Starting...
                      </span>
                    </Show>
                  </Button>
                }
              >
                <Button
                  variant="destructive"
                  onClick={handleStop}
                  disabled={actionLoading()}
                >
                  <Show
                    when={actionLoading()}
                    fallback="Stop"
                  >
                    <span class="flex items-center gap-2">
                      <span class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                      Stopping...
                    </span>
                  </Show>
                </Button>
              </Show>
            </div>
          )}
        </Show>
      </div>

      {/* Loading State */}
      <Show when={loading()}>
        <Card>
          <CardContent class="py-12">
            <div class="flex flex-col items-center justify-center gap-4">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p class="text-muted-foreground">Loading service...</p>
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Error State */}
      <Show when={!loading() && error()}>
        <Card>
          <CardContent class="py-12">
            <div class="flex flex-col items-center justify-center gap-4">
              <div class="text-6xl">⚠️</div>
              <div class="text-center">
                <h3 class="text-lg font-semibold mb-2">Failed to load service</h3>
                <p class="text-muted-foreground mb-4">{error()}</p>
                <Button onClick={handleRetry}>Retry</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Not Found State */}
      <Show when={!loading() && notFound()}>
        <Card>
          <CardContent class="py-12">
            <div class="flex flex-col items-center justify-center gap-4">
              <div class="text-6xl">🔍</div>
              <div class="text-center">
                <h3 class="text-lg font-semibold mb-2">Service not found</h3>
                <p class="text-muted-foreground mb-4">
                  The service with ID "{params.id}" does not exist.
                </p>
                <Button onClick={() => navigate("/")}>Go to Home</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Service Content */}
      <Show when={!loading() && !error() && !notFound() && service()}>
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
                <Show
                  when={service().status === "running"}
                  fallback={
                    <p class="text-muted-foreground text-sm">
                      Metrics are only available when the service is running.
                    </p>
                  }
                >
                  <Show
                    when={!loadingMetrics() && serviceMetrics()}
                    fallback={
                      <div class="flex items-center justify-center py-8">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    }
                  >
                    <MetricsDisplay metrics={serviceMetrics()!} showPid />
                  </Show>
                </Show>
              </CardContent>
            </Card>

            <LogViewer serviceId={service().id} />
          </>
        )}
      </Show>
    </div>
  );
};

