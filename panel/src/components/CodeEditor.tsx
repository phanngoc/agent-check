import { Component, createEffect, onMount, onCleanup } from "solid-js";
import * as monaco from "monaco-editor";

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  readOnly?: boolean;
}

export const CodeEditor: Component<CodeEditorProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;

  onMount(() => {
    if (!containerRef) return;

    // Create Monaco Editor instance
    editorInstance = monaco.editor.create(containerRef, {
      value: props.value || "",
      language: props.language || "plaintext",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      lineNumbers: "on",
      readOnly: props.readOnly || false,
      wordWrap: "on",
    });

    // Listen for content changes
    editorInstance.onDidChangeModelContent(() => {
      const value = editorInstance?.getValue() || "";
      props.onChange(value);
    });
  });

  createEffect(() => {
    if (editorInstance && props.value !== undefined) {
      const currentValue = editorInstance.getValue();
      if (currentValue !== props.value) {
        editorInstance.setValue(props.value);
      }
    }
  });

  createEffect(() => {
    if (editorInstance && props.language) {
      monaco.editor.setModelLanguage(editorInstance.getModel()!, props.language);
    }
  });

  onCleanup(() => {
    if (editorInstance) {
      editorInstance.dispose();
    }
  });

  return (
    <div
      ref={containerRef}
      class="w-full h-full"
      style={{ "min-height": "400px" }}
    />
  );
};

