import { Component, createSignal, onMount, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { CodeEditor } from "@/components/CodeEditor";
import { ChatPanel } from "@/components/ChatPanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { FileTree } from "@/components/FileTree";
import { Button } from "@/components/ui/button";
import * as api from "@/api/client";

export const ProjectEditor: Component = () => {
  const params = useParams<{ id: string }>();
  const [project, setProject] = createSignal<api.Project | null>(null);
  const [files, setFiles] = createSignal<string[]>([]);
  const [selectedFile, setSelectedFile] = createSignal<string | null>(null);
  const [fileContent, setFileContent] = createSignal<string>("");
  const [loading, setLoading] = createSignal(true);
  const [codeEditorExpanded, setCodeEditorExpanded] = createSignal(false);

  onMount(async () => {
    try {
      // Load project info
      const projectData = await api.getProject(params.id);
      setProject(projectData);

      // Load project files
      const projectFiles = await api.getProjectFiles(params.id);
      setFiles(projectFiles);

      // Load first file if available
      if (projectFiles.length > 0) {
        const firstFile = projectFiles[0];
        setSelectedFile(firstFile);
        const content = await api.getProjectFile(params.id, firstFile);
        setFileContent(content);
      }
    } catch (error) {
      console.error("Failed to load project:", error);
      alert("Failed to load project: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  });

  const handleFileSelect = async (filePath: string) => {
    try {
      setSelectedFile(filePath);
      const content = await api.getProjectFile(params.id, filePath);
      setFileContent(content);
    } catch (error) {
      console.error("Failed to load file:", error);
      alert("Failed to load file: " + (error as Error).message);
    }
  };

  const handleSaveFile = async () => {
    const currentFile = selectedFile();
    if (!currentFile) return;

    try {
      await api.saveProjectFile(params.id, currentFile, fileContent());
      alert("File saved successfully!");
    } catch (error) {
      console.error("Failed to save file:", error);
      alert("Failed to save file: " + (error as Error).message);
    }
  };

  return (
    <Show
      when={!loading()}
      fallback={
        <div class="flex items-center justify-center h-screen">
          <div class="text-center">
            <div class="text-lg">Loading project...</div>
          </div>
        </div>
      }
    >
      <div class="h-screen flex flex-col">
        {/* Header */}
        <header class="border-b bg-background px-4 py-2 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-bold">{project()?.name || "Project Editor"}</h1>
            <p class="text-sm text-muted-foreground">{project()?.directory_path}</p>
          </div>
          <div class="flex gap-2">
            <Button onClick={handleSaveFile} variant="outline" size="sm">
              Save
            </Button>
          </div>
        </header>

        {/* Main Content - Layout with Collapsible Code Editor */}
        <div class="flex-1 flex overflow-hidden">
          <Show
            when={codeEditorExpanded()}
            fallback={
              /* Chat and Preview Panels when code editor is closed */
              <div class="w-full flex">
                {/* Chat Panel - Left Column (50%) */}
                <div class="w-1/2 border-r flex flex-col">
                  <div class="border-b px-4 py-2 bg-muted/50 flex items-center justify-between">
                    <div class="text-sm font-medium">Chat with Claude</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCodeEditorExpanded(true)}
                      class="text-xs"
                    >
                      Show Code Editor →
                    </Button>
                  </div>
                  <div class="flex-1 overflow-hidden">
                    <ChatPanel projectId={params.id} />
                  </div>
                </div>

                {/* Preview Panel - Right Column (50%) */}
                <div class="w-1/2 flex flex-col">
                  <div class="border-b px-4 py-2 bg-muted/50 flex items-center justify-between">
                    <div class="text-sm font-medium">Live Preview</div>
                    <PreviewPanel projectId={params.id} />
                  </div>
                  <div class="flex-1 overflow-hidden">
                    <iframe
                      id="preview-iframe"
                      class="w-full h-full border-0"
                      src="about:blank"
                    />
                  </div>
                </div>
              </div>
            }
          >
            {/* FileTree Sidebar and Code Editor when code editor is open */}
            <div class="w-full flex">
              {/* FileTree Sidebar - Left (25%) */}
              <div class="w-1/4">
                <FileTree
                  files={files()}
                  selectedFile={selectedFile()}
                  onFileSelect={handleFileSelect}
                />
              </div>

              {/* Code Editor - Right (75%) */}
              <div class="w-3/4 flex flex-col border-l">
                <div class="border-b px-4 py-2 bg-muted/50 flex items-center justify-between">
                  <div class="text-sm font-medium">
                    {selectedFile() || "No file selected"}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCodeEditorExpanded(false)}
                    class="text-xs"
                  >
                    ← Hide
                  </Button>
                </div>
                <div class="flex-1 overflow-hidden">
                  <CodeEditor
                    value={fileContent()}
                    onChange={setFileContent}
                    language={getLanguageFromFile(selectedFile())}
                  />
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
};

function getLanguageFromFile(filePath: string | null): string {
  if (!filePath) return "plaintext";
  
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "html":
      return "html";
    case "css":
      return "css";
    case "json":
      return "json";
    case "rs":
      return "rust";
    case "go":
      return "go";
    case "py":
      return "python";
    case "php":
      return "php";
    default:
      return "plaintext";
  }
}

