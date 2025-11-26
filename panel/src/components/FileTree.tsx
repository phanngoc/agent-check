import { Component, createSignal, For, Show } from "solid-js";
import { Input } from "@/components/ui/input";
import { buildFileTree, getFileIcon, filterTree } from "@/lib/utils";
import type { FileTreeNode } from "@/types";

export interface FileTreeProps {
  files: string[];
  selectedFile: string | null;
  onFileSelect: (filePath: string) => void;
}

export const FileTree: Component<FileTreeProps> = (props) => {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [expandedPaths, setExpandedPaths] = createSignal<Set<string>>(new Set());

  // Build initial tree
  const initialTree = () => buildFileTree(props.files);
  
  // Apply search filter
  const displayTree = () => {
    const tree = initialTree();
    const query = searchQuery();
    if (!query.trim()) {
      return tree;
    }
    return filterTree(tree, query);
  };

  // Toggle folder expansion
  const toggleFolder = (path: string) => {
    setExpandedPaths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  // Check if folder is expanded
  const isExpanded = (path: string) => {
    return expandedPaths().has(path);
  };

  // Render tree node
  const renderNode = (node: FileTreeNode, level: number = 0) => {
    const indent = level * 16;
    const isSelected = props.selectedFile === node.path;
    const isFolder = node.type === 'folder';
    // Use node.expanded if available (from filtered tree), otherwise check expandedPaths
    const expanded = node.expanded !== undefined ? node.expanded : isExpanded(node.path);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div>
        <div
          class={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-muted/50 ${
            isSelected ? 'bg-muted' : ''
          }`}
          style={{ "padding-left": `${indent + 8}px` }}
          onClick={() => {
            if (isFolder) {
              // Only toggle if not in search mode (node.expanded is undefined means not from filtered tree)
              if (node.expanded === undefined) {
                toggleFolder(node.path);
              }
            } else {
              props.onFileSelect(node.path);
            }
          }}
        >
          {/* Chevron for folders */}
          <Show when={isFolder}>
            <span class="w-4 text-xs">
              {hasChildren ? (expanded ? '▼' : '▶') : ' '}
            </span>
          </Show>
          <Show when={!isFolder}>
            <span class="w-4"></span>
          </Show>

          {/* Icon */}
          <span class="text-sm">
            {isFolder ? '📁' : getFileIcon(node.path)}
          </span>

          {/* Name */}
          <span class={`text-sm flex-1 truncate ${isSelected ? 'font-semibold' : ''}`}>
            {node.name}
          </span>
        </div>

        {/* Render children if expanded */}
        <Show when={isFolder && expanded && hasChildren}>
          <For each={node.children}>
            {(child) => renderNode(child, level + 1)}
          </For>
        </Show>
      </div>
    );
  };

  return (
    <div class="h-full flex flex-col border-r bg-background">
      {/* Header with search */}
      <div class="border-b px-3 py-2 bg-muted/50">
        <div class="text-sm font-medium mb-2">Project Files</div>
        <Input
          type="text"
          placeholder="Search files..."
          value={searchQuery()}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
          class="h-8 text-xs"
        />
      </div>

      {/* Tree view */}
      <div class="flex-1 overflow-y-auto">
        <For each={displayTree()}>
          {(node) => renderNode(node)}
        </For>
      </div>
    </div>
  );
};

