import { validateProject, type ValidationIssue } from "@mmx/project-schema";
import type { StudioProject, ProjectIssue } from "@mmx/project-io";
import { updateLevelDocument } from "@mmx/project-io";

export type ProjectSessionState = {
  open: boolean;
  rootPath: string | null;
  project: StudioProject | null;
  issues: ProjectIssue[];
};

const EMPTY: ProjectSessionState = {
  open: false,
  rootPath: null,
  project: null,
  issues: [],
};

function mapSchemaIssues(issues: ValidationIssue[]): ProjectIssue[] {
  return issues.map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    path: issue.path,
  }));
}

function validateOpenProject(project: StudioProject): ProjectIssue[] {
  return mapSchemaIssues(validateProject(project.manifest).issues);
}

export class ProjectSession {
  private state: ProjectSessionState = { ...EMPTY };
  private readonly listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): ProjectSessionState => this.state;

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private setState(next: ProjectSessionState): void {
    this.state = next;
    this.emit();
  }

  getEntryLevelDocument() {
    const project = this.state.project;
    if (!project) return null;
    const entry = project.levels.find((level) => level.id === project.manifest.entryLevelId);
    return entry?.document ?? project.levels[0]?.document ?? null;
  }

  syncLevel(levelId: string, document: StudioProject["levels"][number]["document"]): void {
    if (!this.state.project) return;
    const nextProject = updateLevelDocument(this.state.project, levelId, document);
    this.setState({
      ...this.state,
      project: nextProject,
      issues: validateOpenProject(nextProject),
    });
  }

  async createProject(): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    if (!bridge) {
      return [{ severity: "error", code: "project.unavailable", path: "/", message: "Project I/O is only available in the Electron shell." }];
    }

    const rootPath = await bridge.pickDirectory("Create Project");
    if (!rootPath) return [];

    const name = window.prompt("Project name?", "Untitled Project")?.trim();
    if (!name) return [];

    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "");
    const projectId = id.length > 0 ? `${id}.project` : "untitled.project";

    const result = await bridge.create(rootPath, { id: projectId, name });
    if (!result.ok) {
      this.setState({ ...EMPTY, issues: result.issues });
      return result.issues;
    }

    this.setState({
      open: true,
      rootPath: result.value.rootPath,
      project: result.value.project,
      issues: [...result.issues, ...validateOpenProject(result.value.project)],
    });
    return this.state.issues;
  }

  async openProject(): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    if (!bridge) {
      return [{ severity: "error", code: "project.unavailable", path: "/", message: "Project I/O is only available in the Electron shell." }];
    }

    const rootPath = await bridge.pickDirectory("Open Project");
    if (!rootPath) return [];

    const result = await bridge.load(rootPath);
    if (!result.ok) {
      this.setState({ ...EMPTY, issues: result.issues });
      return result.issues;
    }

    this.setState({
      open: true,
      rootPath: result.value.rootPath,
      project: result.value.project,
      issues: [...result.issues, ...validateOpenProject(result.value.project)],
    });
    return this.state.issues;
  }

  async saveProject(): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    const { rootPath, project } = this.state;
    if (!bridge || !rootPath || !project) return [];

    const result = await bridge.save(rootPath, project);
    if (!result.ok) {
      this.setState({ ...this.state, issues: result.issues });
      return result.issues;
    }

    this.setState({
      ...this.state,
      project: result.value.project,
      issues: [...result.issues, ...validateOpenProject(result.value.project)],
    });
    return this.state.issues;
  }

  async exportProject(): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    const { rootPath, project } = this.state;
    if (!bridge || !rootPath || !project) {
      return [{ severity: "error", code: "project.closed", path: "/", message: "Open a project before exporting." }];
    }

    const destinationRoot = await bridge.pickExportDirectory("Export Project");
    if (!destinationRoot) return [];

    const result = await bridge.export(rootPath, destinationRoot, project);
    if (!result.ok) {
      this.setState({ ...this.state, issues: result.issues });
      return result.issues;
    }

    return result.issues;
  }

  close(): void {
    this.setState({ ...EMPTY });
  }
}

export const projectSession = new ProjectSession();
