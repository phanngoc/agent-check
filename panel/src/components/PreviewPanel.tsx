import { Component, createSignal, onMount, onCleanup } from "solid-js";
import { Button } from "@/components/ui/button";
import * as api from "@/api/client";

export interface PreviewPanelProps {
  projectId: string;
}

export const PreviewPanel: Component<PreviewPanelProps> = (props) => {
  const [isRunning, setIsRunning] = createSignal(false);
  const [previewUrl, setPreviewUrl] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  const checkDevServerStatus = async () => {
    try {
      const status = await api.getDevServerStatus(props.projectId);
      setIsRunning(status.running);
      if (status.running && status.url) {
        setPreviewUrl(status.url);
        updateIframe(status.url);
      }
    } catch (error) {
      console.error("Failed to check dev server status:", error);
    }
  };

  const updateIframe = (url: string) => {
    const iframe = document.getElementById("preview-iframe") as HTMLIFrameElement;
    if (iframe) {
      iframe.src = url;
    }
  };

  onMount(() => {
    checkDevServerStatus();
    // Poll for status updates
    const interval = setInterval(checkDevServerStatus, 5000);
    
    onCleanup(() => {
      clearInterval(interval);
    });
  });

  const handleStart = async () => {
    setLoading(true);
    try {
      await api.startDevServer(props.projectId);
      // Wait a bit for server to start
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await checkDevServerStatus();
    } catch (error) {
      console.error("Failed to start dev server:", error);
      alert("Failed to start dev server: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await api.stopDevServer(props.projectId);
      setIsRunning(false);
      setPreviewUrl(null);
      updateIframe("about:blank");
    } catch (error) {
      console.error("Failed to stop dev server:", error);
      alert("Failed to stop dev server: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="flex items-center gap-2">
      <Button
        onClick={isRunning() ? handleStop : handleStart}
        disabled={loading()}
        size="sm"
        variant={isRunning() ? "destructive" : "default"}
      >
        {loading()
          ? "Loading..."
          : isRunning()
          ? "Stop"
          : "Play"}
      </Button>
      {isRunning() && previewUrl() && (
        <a
          href={previewUrl()!}
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-muted-foreground hover:underline"
        >
          Open in new tab
        </a>
      )}
    </div>
  );
};

