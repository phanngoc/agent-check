import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { FileTreeNode } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert mảng file paths thành tree structure
 */
export function buildFileTree(files: string[]): FileTreeNode[] {
  const tree: FileTreeNode[] = [];
  const nodeMap = new Map<string, FileTreeNode>();

  // Sort files để đảm bảo folders được tạo trước
  const sortedFiles = [...files].sort();

  for (const filePath of sortedFiles) {
    const parts = filePath.split('/');
    let currentPath = '';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const previousPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!nodeMap.has(currentPath)) {
        const node: FileTreeNode = {
          name: part,
          path: currentPath,
          type: isLast ? 'file' : 'folder',
          children: isLast ? undefined : [],
          expanded: false,
        };
        
        nodeMap.set(currentPath, node);
        
        if (previousPath) {
          const parent = nodeMap.get(previousPath);
          if (parent && parent.children) {
            parent.children.push(node);
          }
        } else {
          tree.push(node);
        }
      }
    }
  }

  return tree;
}

/**
 * Get file icon emoji dựa trên file extension
 */
export function getFileIcon(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  
  const iconMap: Record<string, string> = {
    // Code files
    'ts': '📘',
    'tsx': '⚛️',
    'js': '📜',
    'jsx': '⚛️',
    'rs': '🦀',
    'go': '🐹',
    'py': '🐍',
    'php': '🐘',
    'java': '☕',
    'cpp': '⚙️',
    'c': '⚙️',
    'cs': '🔷',
    'rb': '💎',
    'swift': '🐦',
    'kt': '🔷',
    
    // Web
    'html': '🌐',
    'css': '🎨',
    'scss': '🎨',
    'sass': '🎨',
    'less': '🎨',
    
    // Config
    'json': '📋',
    'yaml': '📋',
    'yml': '📋',
    'toml': '📋',
    'xml': '📋',
    'ini': '📋',
    'conf': '📋',
    'config': '📋',
    
    // Data
    'sql': '🗄️',
    'db': '🗄️',
    'sqlite': '🗄️',
    
    // Docs
    'md': '📝',
    'txt': '📄',
    'readme': '📖',
    
    // Images
    'png': '🖼️',
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'gif': '🖼️',
    'svg': '🖼️',
    'webp': '🖼️',
    
    // Other
    'lock': '🔒',
    'gitignore': '🚫',
    'dockerfile': '🐳',
    'makefile': '🔧',
  };
  
  if (ext && iconMap[ext]) {
    return iconMap[ext];
  }
  
  // Default icons
  if (filePath.includes('package.json') || filePath.includes('package-lock.json')) {
    return '📦';
  }
  if (filePath.includes('composer.json') || filePath.includes('composer.lock')) {
    return '📦';
  }
  if (filePath.includes('Cargo.toml') || filePath.includes('Cargo.lock')) {
    return '📦';
  }
  
  return '📄';
}

/**
 * Filter tree theo search query
 */
export function filterTree(tree: FileTreeNode[], query: string): FileTreeNode[] {
  if (!query.trim()) {
    return tree;
  }
  
  const lowerQuery = query.toLowerCase();
  
  function filterNode(node: FileTreeNode): FileTreeNode | null {
    const matchesQuery = node.name.toLowerCase().includes(lowerQuery);
    
    if (node.type === 'file') {
      return matchesQuery ? { ...node } : null;
    }
    
    // For folders, check if any children match
    const filteredChildren: FileTreeNode[] = [];
    if (node.children) {
      for (const child of node.children) {
        const filteredChild = filterNode(child);
        if (filteredChild) {
          filteredChildren.push(filteredChild);
        }
      }
    }
    
    // Include folder if it matches query or has matching children
    if (matchesQuery || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
        expanded: true, // Auto-expand filtered folders
      };
    }
    
    return null;
  }
  
  const filtered: FileTreeNode[] = [];
  for (const node of tree) {
    const filteredNode = filterNode(node);
    if (filteredNode) {
      filtered.push(filteredNode);
    }
  }
  
  return filtered;
}

