import { Component } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricsDisplay } from "./MetricsDisplay";
import type { Service } from "@/types";

export interface ServiceCardProps {
  service: Service;
  metrics?: { cpu_usage: number; memory_usage: number; uptime: number } | null;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onViewLogs: (id: string, name: string) => void;
  onViewDetails: (id: string) => void;
}

const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "running":
      return "default";
    case "stopped":
      return "destructive";
    case "error":
      return "destructive";
    case "starting":
    case "stopping":
      return "secondary";
    default:
      return "outline";
  }
};

export const ServiceCard: Component<ServiceCardProps> = (props) => {
  return (
    <Card class="hover:border-primary transition-all">
      <CardHeader>
        <div class="flex justify-between items-center">
          <CardTitle class="text-xl">{props.service.name}</CardTitle>
          <Badge variant={getStatusVariant(props.service.status)}>
            {props.service.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Type:</span>
            <span>{props.service.service_type}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Port:</span>
            <span>{props.service.port || "N/A"}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Restarts:</span>
            <span>{props.service.restart_count}</span>
          </div>
        </div>

        {props.service.status === "running" && (
          <MetricsDisplay metrics={props.metrics || null} />
        )}

        <div class="flex gap-2 flex-wrap">
          {props.service.status === "running" ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => props.onStop(props.service.id)}
              >
                Stop
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => props.onRestart(props.service.id)}
              >
                Restart
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => props.onStart(props.service.id)}
            >
              Start
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => props.onViewLogs(props.service.id, props.service.name)}
          >
            Logs
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => props.onViewDetails(props.service.id)}
          >
            Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

