import { Component, createSignal, createEffect, For, onMount, onCleanup } from "solid-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ChatPanelProps {
  projectId: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export const ChatPanel: Component<ChatPanelProps> = (props) => {
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [input, setInput] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [ws, setWs] = createSignal<WebSocket | null>(null);
  const [connected, setConnected] = createSignal(false);
  let messagesEndRef: HTMLDivElement | undefined;

  onMount(() => {
    // Connect to WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/projects/${props.projectId}/chat`;
    
    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log("WebSocket connected");
      setConnected(true);
      setWs(websocket);
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "message") {
          // Filter out "[DONE]" if it somehow gets through
          const content = data.content || "";
          if (content.trim() === "[DONE]") {
            return;
          }
          
          // Add or update message
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === data.id);
            if (existing) {
              // Update existing message with accumulated content from backend
              return prev.map((m) =>
                m.id === data.id
                  ? { ...m, content: content }
                  : m
              );
            } else {
              // Add new message
              return [
                ...prev,
                {
                  id: data.id,
                  role: data.role,
                  content: content,
                  timestamp: new Date(data.timestamp),
                },
              ];
            }
          });
        } else if (data.type === "error") {
          alert("Error: " + data.message);
          setSending(false);
        } else if (data.type === "done") {
          setSending(false);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnected(false);
    };

    websocket.onclose = () => {
      console.log("WebSocket disconnected");
      setConnected(false);
      setWs(null);
    };

    return () => {
      websocket.close();
    };
  });

  onCleanup(() => {
    const websocket = ws();
    if (websocket) {
      websocket.close();
    }
  });

  const scrollToBottom = () => {
    messagesEndRef?.scrollIntoView({ behavior: "smooth" });
  };

  createEffect(() => {
    if (messages().length > 0) {
      scrollToBottom();
    }
  });

  const handleSend = () => {
    const message = input().trim();
    if (!message || sending() || !connected()) return;

    // Don't add user message here - wait for backend to echo it back
    // This prevents duplicate messages
    setInput("");
    setSending(true);

    // Send message via WebSocket
    const websocket = ws();
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(
        JSON.stringify({
          type: "message",
          content: message,
        })
      );
    } else {
      alert("WebSocket not connected");
      setSending(false);
    }
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div class="h-full flex flex-col bg-background">
      {/* Messages */}
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <For each={messages()}>
          {(message) => (
            <div
              class={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                class={`max-w-[80%] rounded-lg p-3 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <div class="text-sm whitespace-pre-wrap">{message.content}</div>
                <div
                  class={`text-xs mt-1 ${
                    message.role === "user"
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          )}
        </For>
        {sending() && (
          <div class="flex justify-start">
            <div class="bg-muted rounded-lg p-3">
              <div class="text-sm text-muted-foreground">Claude is thinking...</div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div class="border-t p-4">
        <div class="flex gap-2">
          <Input
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            disabled={!connected() || sending()}
            class="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!connected() || sending() || !input().trim()}
          >
            Send
          </Button>
        </div>
        <div class="text-xs text-muted-foreground mt-2">
          {connected() ? "Connected" : "Connecting..."}
        </div>
      </div>
    </div>
  );
};

