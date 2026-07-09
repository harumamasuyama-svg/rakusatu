import type { ProjectData } from "../types/domain";

const KEY = "rakusatsu.projects.v1";

export function loadProjects(): ProjectData[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as ProjectData[];
  } catch {
    return [];
  }
}

export function saveProject(project: ProjectData) {
  const projects = loadProjects();
  const updated = { ...project, updatedAt: new Date().toISOString() };
  const next = [updated, ...projects.filter((item) => item.id !== project.id)].slice(0, 30);
  localStorage.setItem(KEY, JSON.stringify(next));
  return updated;
}
