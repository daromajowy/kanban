import type { BoardData, BoardStage, Subtask, Task } from '../types/kanban';

export const DEFAULT_STAGES: BoardStage[] = [
  { id: 'todo', title: 'Do zrobienia', color: '#6366f1' },
  { id: 'in_progress', title: 'W trakcie', color: '#f59e0b' },
  { id: 'done', title: 'Zrobione', color: '#10b981' },
];
export const STAGE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#db2777', '#0284c7', '#64748b', '#d97706', '#0d9488'];
export const emptyBoard = (): BoardData => ({ tasks: [], members: [], stages: DEFAULT_STAGES.map(s => ({ ...s })) });
export const stageTitle = (stages: BoardStage[], id: string) => stages.find(s => s.id === id)?.title ?? id;

export function assertDraftCurrent(data: BoardData, original: Task | null, id?: string): void {
  if (!id) return;
  const current = data.tasks.find(t => t.id === id);
  if (!current) throw new Error('To zadanie zostało usunięte przez inną osobę.');
  if (!original || JSON.stringify(current) !== JSON.stringify(original)) {
    throw new Error('Ktoś zmienił to zadanie podczas edycji. Twoja treść pozostaje w formularzu. Skopiuj ją, otwórz zadanie ponownie i nanieś zmianę na aktualną wersję.');
  }
}

// Stable IDs preserve historical tasks. "done" means completed in any position.
export function addStage(data: BoardData, title: string, color: string, id: string): BoardData {
  const name = title.trim();
  if (!name || name.length > 48 || data.stages.length >= 20 || data.stages.some(s => s.title.toLocaleLowerCase('pl') === name.toLocaleLowerCase('pl')) || data.stages.some(s => s.id === id)) {
    throw new Error('Podaj unikalną nazwę etapu (1–48 znaków). Limit: 20 etapów.');
  }
  const stage = { id, title: name, color: STAGE_COLORS.includes(color) ? color : STAGE_COLORS[0] };
  const stages = [...data.stages];
  stages.splice(Math.max(0, stages.findIndex(s => s.id === 'done')), 0, stage);
  return { ...data, stages };
}

export function moveStage(data: BoardData, stageId: string, targetId: string): BoardData {
  const from = data.stages.findIndex(s => s.id === stageId);
  const to = data.stages.findIndex(s => s.id === targetId);
  if (from < 0 || to < 0 || from === to) return data;
  const stages = [...data.stages];
  const [stage] = stages.splice(from, 1);
  stages.splice(to, 0, stage);
  return { ...data, stages };
}

export function setStageColor(data: BoardData, stageId: string, color: string): BoardData {
  if (!/^#[\da-f]{6}$/i.test(color)) throw new Error('Wybierz prawidłowy kolor etapu.');
  if (!data.stages.some(s => s.id === stageId)) return data;
  return { ...data, stages: data.stages.map(s => s.id === stageId ? { ...s, color } : s) };
}

// Insertion before a visible card preserves the order of filtered-out cards.
export function moveTask(data: BoardData, taskId: string, stageId: string, beforeId?: string): BoardData {
  const task = data.tasks.find(t => t.id === taskId);
  if (!task || !data.stages.some(s => s.id === stageId) || beforeId === taskId) return data;
  const tasks = data.tasks.filter(t => t.id !== taskId);
  const target = beforeId ? tasks.findIndex(t => t.id === beforeId && t.status === stageId) : -1;
  const lastInStage = tasks.reduce((last, t, i) => t.status === stageId ? i : last, -1);
  const position = target >= 0 ? target : lastInStage >= 0 ? lastInStage + 1 : tasks.length;
  tasks.splice(position, 0, { ...task, status: stageId, updatedAt: new Date().toISOString() });
  return { ...data, tasks };
}

export function assignTask(data: BoardData, taskId: string, assigneeId: string | null): BoardData {
  const task = data.tasks.find(t => t.id === taskId);
  if (!task) return data;
  const validAssignee = assigneeId && data.members.some(m => m.id === assigneeId) ? assigneeId : null;
  if (task.assigneeId === validAssignee) return data;
  const now = new Date().toISOString();
  return { ...data, tasks: data.tasks.map(t => t.id === taskId ? { ...t, assigneeId: validAssignee, updatedAt: now } : t) };
}

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 10000): v is string => typeof v === 'string' && v.length <= max;
const unique = (items: { id: string }[]) => new Set(items.map(i => i.id)).size === items.length;
const id = (v: unknown): v is string => text(v, 120) && /^[a-zA-Z0-9_-]+$/.test(v);
const color = (v: unknown): v is string => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v);

export function parseBoard(value: unknown): BoardData {
  if (!isObject(value) || !Array.isArray(value.tasks) || !Array.isArray(value.members) || !Array.isArray(value.stages)) throw new Error('Nieprawidłowy format tablicy.');
  const { tasks, members, stages } = value;
  if (tasks.length > 5000 || members.length > 200 || stages.length < 3 || stages.length > 20) throw new Error('Przekroczono rozmiar tablicy.');
  if (!stages.every(s => isObject(s) && id(s.id) && text(s.title, 48) && s.title.trim() && color(s.color)) || !unique(stages)) throw new Error('Nieprawidłowe etapy.');
  if (!['todo', 'in_progress', 'done'].every(id => stages.some(s => s.id === id))) throw new Error('Brakuje etapu podstawowego.');
  if (!members.every(m => isObject(m) && id(m.id) && text(m.name, 120) && text(m.email, 254) && text(m.role, 120) && color(m.color) && ['active', 'invited'].includes(m.status)) || !unique(members)) throw new Error('Nieprawidłowa lista osób.');
  if (!tasks.every(t => isObject(t) && id(t.id) && text(t.title, 300) && t.title.trim() && text(t.description) && stages.some(s => s.id === t.status)
    && ['low', 'medium', 'high', 'urgent'].includes(t.priority) && text(t.dueDate, 40) && (!t.dueDate || Number.isFinite(Date.parse(t.dueDate)))
    && (t.assigneeId === null || members.some(m => m.id === t.assigneeId)) && text(t.createdAt, 40) && text(t.updatedAt, 40)
    && Array.isArray(t.tags) && t.tags.length <= 30 && t.tags.every(tag => text(tag, 100))
    && Array.isArray(t.subtasks) && t.subtasks.length <= 100 && unique(t.subtasks) && t.subtasks.every(s => isObject(s) && id(s.id) && text(s.title, 300) && typeof s.completed === 'boolean')) || !unique(tasks)) throw new Error('Nieprawidłowe dane zadań.');
  // Unknown properties, old auth metadata and arbitrary avatar URLs are dropped.
  return {
    stages: stages.map(s => ({ id: s.id, title: s.title.trim(), color: s.color })),
    members: members.map(m => ({ id: m.id, name: m.name, email: m.email, role: m.role, color: m.color, status: m.status })),
    tasks: tasks.map(t => ({ id: t.id, title: t.title.trim(), description: t.description, status: t.status, priority: t.priority, dueDate: t.dueDate,
      assigneeId: t.assigneeId, tags: t.tags, subtasks: t.subtasks.map((s: Subtask) => ({ id: s.id, title: s.title, completed: s.completed })),
      createdAt: t.createdAt, updatedAt: t.updatedAt, ...(Number.isSafeInteger(t.githubIssueNumber) ? { githubIssueNumber: t.githubIssueNumber } : {}) } as Task)),
  };
}

export function parseLegacyBoard(tasks: unknown, members: unknown): { data: BoardData; unassigned: number } {
  if (!Array.isArray(tasks) || !Array.isArray(members)) throw new Error('Nieprawidłowy format poprzedniej tablicy.');
  const known = new Set(members.filter(isObject).map(m => m.id));
  let unassigned = 0;
  const migrated = tasks.map(t => {
    if (isObject(t) && t.assigneeId && !known.has(t.assigneeId)) { unassigned++; return { ...t, assigneeId: null }; }
    return t;
  });
  return { data: parseBoard({ tasks: migrated, members, stages: DEFAULT_STAGES }), unassigned };
}

export function readLegacyBoard(): { data: BoardData; unassigned: number } | null {
  const tasks = localStorage.getItem('kanban_tasks_v2');
  if (!tasks) return null;
  const members = JSON.parse(localStorage.getItem('kanban_members_v2') ?? '[]');
  return parseLegacyBoard(JSON.parse(tasks), members);
}
