import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addStage, assertDraftCurrent, emptyBoard, moveStage, moveTask, parseBoard, parseLegacyBoard, setStageColor } from '../src/utils/board';
import { INITIAL_TASKS, INITIAL_MEMBERS } from '../src/utils/storage';
import { clearLegacyAuthentication } from '../src/utils/authStorage';
import { generateGitHubIssuesMarkdown } from '../src/utils/githubExport';
import type { BoardData, Task } from '../src/types/kanban';
const task = (id: string, status = 'todo'): Task => ({ id, title: id, description: '', status, priority: 'medium', dueDate: '', assigneeId: null, tags: [], subtasks: [], createdAt: '2026-09-29', updatedAt: '2026-09-29' });
test('custom stage survives serialization and is inserted before Done', () => {
  const data = addStage(emptyBoard(), '  Do akceptacji  ', '#6366f1', 'review');
  assert.deepEqual(data.stages.map(s => s.id), ['todo', 'in_progress', 'review', 'done']);
  assert.equal(parseBoard(JSON.parse(JSON.stringify(data))).stages[2].title, 'Do akceptacji');
  assert.throws(() => addStage(data, 'DO AKCEPTACJI', '#6366f1', 'other'));
  assert.throws(() => addStage(data, '  ', '#6366f1', 'other'));
});
test('original board migrates without dropping tasks with deleted assignees', () => {
  const result = parseLegacyBoard(INITIAL_TASKS, INITIAL_MEMBERS);
  assert.equal(result.data.tasks.length, INITIAL_TASKS.length);
  assert.equal(result.unassigned, 1);
  assert.equal(result.data.tasks.find(t => t.id === 'task-6')?.assigneeId, null);
  assert.deepEqual(result.data.tasks.map(t => t.id), INITIAL_TASKS.map(t => t.id));
});

test('stage reordering survives serialization without moving tasks or changing completed status', () => {
  const original: BoardData = { ...addStage(emptyBoard(), 'Weryfikacja', '#6366f1', 'review'), tasks: [task('a'), task('b', 'done'), task('c', 'review')] };
  const first = moveStage(original, 'done', 'todo');
  assert.deepEqual(first.stages.map(s => s.id), ['done', 'todo', 'in_progress', 'review']);
  const last = moveStage(first, 'done', 'review');
  assert.deepEqual(last.stages.map(s => s.id), ['todo', 'in_progress', 'review', 'done']);
  const roundTrip = parseBoard(JSON.parse(JSON.stringify(moveStage(first, 'review', 'todo'))));
  assert.deepEqual(roundTrip.stages.map(s => s.id), ['done', 'review', 'todo', 'in_progress']);
  assert.deepEqual(roundTrip.tasks, original.tasks);
  assert.deepEqual(original.stages.map(s => s.id), ['todo', 'in_progress', 'review', 'done']);
  assert.equal(moveStage(original, 'todo', 'missing'), original);
  assert.equal(moveStage(original, 'missing', 'todo'), original);
  assert.equal(moveStage(original, 'todo', 'todo'), original);
});

test('stage colors persist after reordering while unsafe colors and task mutations are excluded', () => {
  const original = { ...emptyBoard(), tasks: [task('a'), task('b', 'done')] };
  const moved = moveStage(original, 'done', 'todo');
  const updated = parseBoard(JSON.parse(JSON.stringify(setStageColor(moved, 'done', '#db2777'))));
  assert.equal(updated.stages[0].id, 'done');
  assert.equal(updated.stages[0].color, '#db2777');
  assert.deepEqual(updated.tasks, original.tasks);
  assert.equal(original.stages[2].color, '#10b981');
  assert.equal(setStageColor(original, 'missing', '#db2777'), original);
  assert.throws(() => setStageColor(original, 'done', 'url(https://example.test)'));
});
test('a draft cannot overwrite a task updated by background refresh', () => {
  const original = task('a');
  assert.throws(() => assertDraftCurrent({ ...emptyBoard(), tasks: [{ ...original, description: 'Teammate update' }] }, original, 'a'), /podczas edycji/);
  assert.throws(() => assertDraftCurrent(emptyBoard(), original, 'a'), /usunięte/);
  assert.doesNotThrow(() => assertDraftCurrent({ ...emptyBoard(), tasks: [original, task('other')] }, original, 'a'));
});
test('moving between stages, into an empty stage, both reorder directions and hidden cards preserves tasks', () => {
  const original: BoardData = { ...addStage(emptyBoard(), 'Weryfikacja', '#6366f1', 'review'), tasks: [task('a'), task('hidden'), task('b'), task('c')] };
  const movedDown = moveTask(original, 'a', 'todo', 'c');
  assert.deepEqual(movedDown.tasks.map(t => t.id), ['hidden', 'b', 'a', 'c']);
  const movedUp = moveTask(movedDown, 'c', 'todo', 'hidden');
  assert.deepEqual(movedUp.tasks.map(t => t.id), ['c', 'hidden', 'b', 'a']);
  const custom = moveTask(movedUp, 'b', 'review');
  assert.equal(custom.tasks.find(t => t.id === 'b')?.status, 'review');
  assert.equal(parseBoard(custom).tasks.length, 4);
  assert.equal(moveTask(original, 'a', 'bogus'), original);
  assert.equal(moveTask(original, 'a', 'todo', 'a'), original);
  assert.deepEqual(original.tasks.map(t => t.id), ['a', 'hidden', 'b', 'c']);
  assert.match(generateGitHubIssuesMarkdown(custom.tasks, [], custom.stages), /Weryfikacja/);
});
test('reject broken references, duplicates, untrusted fields and unsafe styles', () => {
  const data: BoardData = { ...emptyBoard(), tasks: [task('a')] };
  assert.throws(() => parseBoard({ ...data, tasks: [task('a', 'unknown')] }));
  assert.throws(() => parseBoard({ ...data, tasks: [task('a'), task('a')] }));
  assert.throws(() => parseBoard({ ...data, tasks: [{ ...task('a'), assigneeId: 'missing' }] }));
  assert.throws(() => parseBoard({ ...data, stages: data.stages.map(s => ({ ...s, color: 'url(https://example.test)' })) }));
  assert.equal('authSession' in parseBoard({ ...data, authSession: { role: 'admin' } }), false);
  assert.equal('password' in parseBoard({ ...data, tasks: [{ ...task('a'), password: 'do-not-import' }] }).tasks[0], false);
});
test('remove forged and default legacy auth while preserving board data for explicit import', () => {
  const initial = { kanban_tasks_v2: '[{"id":"legacy"}]', kanban_security_config_v2: '{}', kanban_auth_session_v2: '{"user":{"role":"admin"}}' };
  const local = new Map(Object.entries(initial));
  const session = new Map(Object.entries(initial));
  (globalThis as any).window = { localStorage: { removeItem: (key: string) => local.delete(key) }, sessionStorage: { removeItem: (key: string) => session.delete(key) } };
  clearLegacyAuthentication();
  assert.deepEqual([...local.keys()], ['kanban_tasks_v2']);
  assert.deepEqual([...session.keys()], ['kanban_tasks_v2']);
  (globalThis as any).window = { get localStorage() { throw new Error('blocked'); }, get sessionStorage() { throw new Error('blocked'); } };
  assert.doesNotThrow(clearLegacyAuthentication);
});

