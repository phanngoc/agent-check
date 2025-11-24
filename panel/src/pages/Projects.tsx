import { Component, For, Show, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useProjects } from "@/stores/projects";
import type { Project } from "@/api/client";
import type { CreateProjectRequest } from "@/api/client";

export const Projects: Component = () => {
  const navigate = useNavigate();
  const { projects, scanning, scanAll, scanProject, createProject } = useProjects();
  const [selectedProject, setSelectedProject] = createSignal<Project | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const [projectName, setProjectName] = createSignal("");
  const [projectFramework, setProjectFramework] = createSignal("");

  const handleScanAll = async () => {
    try {
      await scanAll();
      alert("Scan completed successfully!");
    } catch (error) {
      alert("Failed to scan projects: " + (error as Error).message);
    }
  };

  const handleScanProject = async (name: string) => {
    try {
      await scanProject(name);
      alert("Project scanned successfully!");
    } catch (error) {
      alert("Failed to scan project: " + (error as Error).message);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName().trim()) {
      alert("Project name is required");
      return;
    }

    setCreating(true);
    try {
      const request: CreateProjectRequest = {
        name: projectName().trim(),
        directory_path: `./sites/${projectName().trim()}`,
        framework: projectFramework() || undefined,
      };

      const result = await createProject(request);
      
      // Navigate to editor page
      navigate(`/projects/${result.project_id}/editor`);
      
      // Reset form
      setProjectName("");
      setProjectFramework("");
      setCreateDialogOpen(false);
    } catch (error) {
      alert("Failed to create project: " + (error as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div class="container mx-auto p-6 space-y-6">
      <header class="flex justify-between items-center pb-6 border-b">
        <div>
          <h1 class="text-3xl font-bold">📁 Projects</h1>
          <p class="text-muted-foreground mt-2">
            Manage and scan projects in ./sites directory
          </p>
        </div>
        <div class="flex gap-2">
          <Button onClick={() => setCreateDialogOpen(true)}>
            Create Project
          </Button>
          <Button onClick={handleScanAll} disabled={scanning()} variant="outline">
            {scanning() ? "Scanning..." : "Scan All Projects"}
          </Button>
        </div>
      </header>

      <Dialog open={createDialogOpen()} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogClose onClose={() => setCreateDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Create a new project in ./sites directory. You'll be redirected to the editor after creation.
            </DialogDescription>
          </DialogHeader>
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <label for="project-name" class="text-sm font-medium">
                Project Name *
              </label>
              <Input
                id="project-name"
                placeholder="my-project"
                value={projectName()}
                onInput={(e) => setProjectName(e.currentTarget.value)}
                disabled={creating()}
              />
            </div>
            <div class="space-y-2">
              <label for="project-framework" class="text-sm font-medium">
                Framework (Optional)
              </label>
              <Select
                id="project-framework"
                value={projectFramework()}
                onChange={(e) => setProjectFramework(e.currentTarget.value)}
                disabled={creating()}
              >
                <option value="">None</option>
                <option value="react">React</option>
                <option value="vue">Vue</option>
                <option value="nextjs">Next.js</option>
                <option value="nestjs">NestJS</option>
                <option value="laravel">Laravel</option>
                <option value="express">Express</option>
              </Select>
            </div>
            <div class="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={creating()}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateProject} disabled={creating()}>
                {creating() ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Show
        when={projects()}
        fallback={<div class="text-center py-12">Loading projects...</div>}
      >
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <For each={projects()}>
            {(project) => (
              <Card
                class="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(`/projects/${project.project_id}/editor`)}
              >
                <CardHeader>
                  <div class="flex justify-between items-start">
                    <div>
                      <CardTitle>{project.name}</CardTitle>
                      <CardDescription>{project.directory_path}</CardDescription>
                    </div>
                    <Badge
                      variant={
                        project.status === "active"
                          ? "default"
                          : project.status === "error"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {project.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div class="space-y-2">
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">Framework:</span>
                      <span>{project.framework || "Unknown"}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">Database:</span>
                      <span>{project.database_type || "N/A"}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">Schema:</span>
                      <span>{project.schema_name}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">Last Scan:</span>
                      <span>
                        {project.last_scan_at
                          ? new Date(project.last_scan_at).toLocaleString()
                          : "Never"}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      class="w-full mt-4"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleScanProject(project.name);
                      }}
                      disabled={scanning()}
                    >
                      {scanning() ? "Scanning..." : "Scan Project"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </For>
        </div>

        <Show when={selectedProject()}>
          {(project) => (
            <Card class="mt-6">
              <CardHeader>
                <CardTitle>Project Details: {project().name}</CardTitle>
                <CardDescription>Metadata and information</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="overview">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="tables">Tables ({project().metadata.tables.length})</TabsTrigger>
                    <TabsTrigger value="models">Models ({project().metadata.models.length})</TabsTrigger>
                    <TabsTrigger value="routes">Routes ({project().metadata.routes.length})</TabsTrigger>
                    <TabsTrigger value="apis">APIs ({project().metadata.apis.length})</TabsTrigger>
                    <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <p class="text-sm font-medium text-muted-foreground">Directory</p>
                        <p class="text-sm">{project().directory_path}</p>
                      </div>
                      <div>
                        <p class="text-sm font-medium text-muted-foreground">Schema</p>
                        <p class="text-sm">{project().schema_name}</p>
                      </div>
                      <div>
                        <p class="text-sm font-medium text-muted-foreground">Framework</p>
                        <p class="text-sm">{project().framework || "Unknown"}</p>
                      </div>
                      <div>
                        <p class="text-sm font-medium text-muted-foreground">Database</p>
                        <p class="text-sm">{project().database_type || "N/A"}</p>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="tables">
                    <div class="space-y-2">
                      <For each={project().metadata.tables}>
                        {(table) => (
                          <Card>
                            <CardHeader>
                              <CardTitle class="text-lg">{table.name}</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div class="space-y-1">
                                <For each={table.columns}>
                                  {(column) => (
                                    <div class="flex justify-between text-sm">
                                      <span>
                                        {column.name}
                                        {column.is_primary_key && (
                                          <Badge variant="outline" class="ml-2">PK</Badge>
                                        )}
                                      </span>
                                      <span class="text-muted-foreground">
                                        {column.data_type}
                                        {column.is_nullable && " (nullable)"}
                                      </span>
                                    </div>
                                  )}
                                </For>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </For>
                    </div>
                  </TabsContent>

                  <TabsContent value="models">
                    <div class="space-y-2">
                      <For each={project().metadata.models}>
                        {(model) => (
                          <Card>
                            <CardHeader>
                              <CardTitle class="text-lg">{model.name}</CardTitle>
                              <CardDescription>{model.file_path}</CardDescription>
                            </CardHeader>
                            <CardContent>
                              <div class="flex flex-wrap gap-2">
                                <For each={model.fields}>
                                  {(field) => (
                                    <Badge variant="outline">{field}</Badge>
                                  )}
                                </For>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </For>
                    </div>
                  </TabsContent>

                  <TabsContent value="routes">
                    <div class="space-y-2">
                      <For each={project().metadata.routes}>
                        {(route) => (
                          <div class="flex items-center gap-2 p-2 border rounded">
                            <Badge>{route.method}</Badge>
                            <span class="font-mono text-sm">{route.path}</span>
                            {route.handler && (
                              <span class="text-sm text-muted-foreground ml-auto">
                                {route.handler}
                              </span>
                            )}
                          </div>
                        )}
                      </For>
                    </div>
                  </TabsContent>

                  <TabsContent value="apis">
                    <div class="space-y-2">
                      <For each={project().metadata.apis}>
                        {(api) => (
                          <div class="flex items-center gap-2 p-2 border rounded">
                            <Badge>{api.method}</Badge>
                            <span class="font-mono text-sm">{api.path}</span>
                            {api.controller && (
                              <span class="text-sm text-muted-foreground ml-auto">
                                {api.controller}
                              </span>
                            )}
                          </div>
                        )}
                      </For>
                    </div>
                  </TabsContent>

                  <TabsContent value="dependencies">
                    <div class="space-y-2">
                      <For each={Object.entries(project().metadata.dependencies)}>
                        {([name, version]) => (
                          <div class="flex justify-between p-2 border rounded">
                            <span class="font-mono text-sm">{name}</span>
                            <span class="text-sm text-muted-foreground">{version}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </Show>
      </Show>
    </div>
  );
};

