import { createResource, createSignal } from "solid-js";
import * as api from "@/api/client";

export function useProjects() {
  const [projects, { refetch }] = createResource(api.listProjects);
  const [scanning, setScanning] = createSignal(false);

  const scanAll = async () => {
    setScanning(true);
    try {
      await api.scanAllProjects();
      await refetch();
    } catch (error) {
      console.error("Failed to scan projects:", error);
      throw error;
    } finally {
      setScanning(false);
    }
  };

  const scanProject = async (name: string) => {
    setScanning(true);
    try {
      await api.scanProject(name);
      await refetch();
    } catch (error) {
      console.error("Failed to scan project:", error);
      throw error;
    } finally {
      setScanning(false);
    }
  };

  const createProject = async (request: api.CreateProjectRequest) => {
    const result = await api.createProject(request);
    await refetch();
    return result;
  };

  const updateProject = async (id: string, request: Partial<api.CreateProjectRequest>) => {
    await api.updateProject(id, request);
    await refetch();
  };

  const deleteProject = async (id: string) => {
    await api.deleteProject(id);
    await refetch();
  };

  return {
    projects,
    scanning,
    scanAll,
    scanProject,
    createProject,
    updateProject,
    deleteProject,
    refetch,
  };
}

