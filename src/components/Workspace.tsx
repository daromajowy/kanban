import { useEffect, useRef, useState } from 'react';
import { Check, Cloud, LoaderCircle, RefreshCw, X } from 'lucide-react';
import type { ActiveTab, BoardData, BoardSnapshot, BoardUser, Task } from '../types/kanban';
import { addStage, assertDraftCurrent, assignTask, moveStage, moveTask, parseBoard, readLegacyBoard, setStageColor } from '../utils/board';
import { AccessDeniedError, RevisionConflictError, loadBoard, saveBoard } from '../utils/supabase';
import { evaluateDueDate } from '../utils/dateUtils';
import { Navbar } from './Navbar';
import { KanbanBoard } from './KanbanBoard';
import { TaskListView } from './TaskListView';
import { TimelineCalendarView } from './TimelineCalendarView';
import { TeamView } from './TeamView';
import { GitHubModal } from './GitHubModal';
import { TaskModal, type TaskDraft } from './TaskModal';

export interface BoardRepository { load: (signal?: AbortSignal) => Promise<BoardSnapshot>; save: (data: BoardData, revision: number) => Promise<BoardSnapshot>; }
const remote: BoardRepository = { load: loadBoard, save: saveBoard };
interface Props { user: BoardUser; onLogout: () => void; onAccessLost: () => void; repository?: BoardRepository; }
export function Workspace({ user, onLogout, onAccessLost, repository = remote }: Props) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const current = useRef<BoardSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const alive = useRef(false);
  const generation = useRef(0);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<ActiveTab>('board');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [defaultStage, setDefaultStage] = useState('todo');
  const [clock, setClock] = useState(Date.now());
  const replace = (value: BoardSnapshot) => { current.current = value; setSnapshot(value); };
  const refresh = async (signal?: AbortSignal) => {
    if (writing.current) return;
    const ticket = generation.current;
    try {
      const next = await repository.load(signal);
      if (alive.current && !signal?.aborted && !writing.current && ticket === generation.current && (!current.current || next.revision > current.current.revision)) replace(next);
    } catch (e) {
      if (!alive.current || signal?.aborted || ticket !== generation.current) return;
      if (e instanceof AccessDeniedError) onAccessLost();
      else setMessage(e instanceof Error ? e.message : 'Nie udało się pobrać tablicy.');
    }
  };
  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    void refresh(abort.signal);
    const tick = setInterval(() => { setClock(Date.now()); void refresh(abort.signal); }, 15000);
    const focus = () => { void refresh(abort.signal); };
    const unload = (event: BeforeUnloadEvent) => { if (writing.current) event.preventDefault(); };
    window.addEventListener('focus', focus);
    window.addEventListener('beforeunload', unload);
    return () => { alive.current = false; ++generation.current; abort.abort(); clearInterval(tick); window.removeEventListener('focus', focus); window.removeEventListener('beforeunload', unload); };
  }, [repository]);
  const commit = async (change: (data: BoardData) => BoardData): Promise<boolean> => {
    if (!current.current || writing.current || !alive.current) return false;
    const previous = current.current;
    let next: BoardData;
    try { next = parseBoard(change(previous.data)); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Nieprawidłowa zmiana.'); return false; }
    writing.current = true; ++generation.current; setBusy(true); setMessage('');
    replace({ ...previous, data: next });
    try {
      const saved = await repository.save(next, previous.revision);
      if (!alive.current) return false;
      replace(saved);
      return true;
    } catch (e) {
      if (!alive.current) return false;
      replace(previous);
      setMessage(e instanceof Error ? e.message : 'Nie zapisano zmiany.');
      if (e instanceof AccessDeniedError) onAccessLost();
      if (e instanceof RevisionConflictError) {
        try { const latest = await repository.load(); if (alive.current) replace(latest); }
        catch (loadError) { if (loadError instanceof AccessDeniedError && alive.current) onAccessLost(); }
      }
      return false;
    } finally {
      ++generation.current;
      writing.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const newTask = (stage = 'todo') => { setEditing(null); setDefaultStage(stage); setModal(true); };
  const edit = (task: Task) => { setEditing(task); setModal(true); };
  const saveTask = (draft: TaskDraft) => commit(data => {
    const now = new Date().toISOString();
    assertDraftCurrent(data, editing, draft.id);
    return { ...data, tasks: draft.id ? data.tasks.map(t => t.id === draft.id ? { ...t, ...draft, id: t.id, updatedAt: now } : t)
      : [{ ...draft, id: crypto.randomUUID(), createdAt: now, updatedAt: now }, ...data.tasks] };
  });
  const move = (id: string, stage: string, before?: string) => { void commit(data => moveTask(data, id, stage, before)); };
  const assign = (id: string, assigneeId: string | null) => { void commit(data => assignTask(data, id, assigneeId)); };
  const importLegacy = async () => {
    try {
      const legacy = readLegacyBoard();
      if (!legacy) { setMessage('W tej przeglądarce nie znaleziono poprzedniej tablicy.'); return; }
      if (!confirm('Przenieść ' + legacy.data.tasks.length + ' zadań i ' + legacy.data.members.length + ' osób do wspólnej tablicy?' + (legacy.unassigned ? '\nZadania z nieistniejącą osobą: ' + legacy.unassigned + '. Zostaną zachowane bez przypisania.' : ''))) return;
      await commit(data => {
        if (user.role !== 'admin' || data.tasks.length || data.members.length) throw new Error('Import jest dostępny tylko na pustej tablicy dla administratora.');
        return legacy.data;
      });
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Nie udało się odczytać poprzedniej tablicy.'); }
  };
  const data = snapshot?.data;
  const overdue = data?.tasks.filter(t => t.status !== 'done' && evaluateDueDate(t.dueDate).isOverdue).length ?? 0;
  const completed = data?.tasks.filter(t => t.status === 'done').length ?? 0;
  const titles = { board: 'Tablica projektu', list: 'Wszystkie zadania', timeline: 'Terminy pod kontrolą', team: 'Ludzie i zadania', github: 'Eksport i kopie' };
  return <div className="workspace">
    <Navbar activeTab={tab} onTab={setTab} user={user} onLogout={onLogout} onNew={() => newTask()} busy={busy || !data} />
    <main className="workspace-main">
      <div className="page-heading"><h1>{titles[tab]}</h1><div className="heading-details"><div className="project-stats"><span><b>{(data?.tasks.length ?? 0) - completed}</b> aktywnych</span><span><b>{completed}</b> zrobionych</span>{overdue > 0 && <span className="overdue"><b>{overdue}</b> po terminie</span>}</div><span className="sync-status" role="status" title={'Ostatnie sprawdzenie: ' + new Date(clock).toLocaleTimeString('pl')} >{busy ? <><LoaderCircle size={13} className="spin" />Zapisywanie</> : data ? <><Check size={13} />Zapisano</> : <><Cloud size={13} />Wczytywanie</>}</span><button className="icon-button" aria-label="Odśwież tablicę" disabled={busy} onClick={() => { setMessage(''); void refresh(); }}><RefreshCw size={16} /></button></div></div>
      {message && <div className="notice error workspace-notice" role="alert"><span>{message}</span><button className="icon-button" aria-label="Zamknij komunikat" onClick={() => setMessage('')}><X size={16} /></button></div>}
      {!data ? <div className="empty-state">{message ? 'Tablica nie została wczytana. Użyj przycisku odświeżania.' : 'Wczytywanie wspólnej tablicy…'}</div> : <>
        {tab === 'board' && <KanbanBoard data={data} onEdit={edit} onNew={newTask} onMove={move} onAssign={assign} disabled={busy} onAddStage={(name, color) => commit(d => addStage(d, name, color, crypto.randomUUID()))} onMoveStage={(id, target) => { void commit(d => moveStage(d, id, target)); }} onStageColor={(id, color) => commit(d => setStageColor(d, id, color))} />}
        {tab === 'list' && <TaskListView data={data} onEdit={edit} onMove={move} onAssign={assign} busy={busy} />}
        {tab === 'timeline' && <TimelineCalendarView data={data} onEdit={edit} busy={busy} />}
        {tab === 'team' && <TeamView data={data} busy={busy} onAdd={m => commit(d => ({ ...d, members: [...d.members, m] }))} onRemove={id => commit(d => ({ ...d, members: d.members.filter(m => m.id !== id), tasks: d.tasks.map(t => t.assigneeId === id ? { ...t, assigneeId: null } : t) }))} />}
        {tab === 'github' && <GitHubModal data={data} busy={busy} canImport={user.role === 'admin'} onImport={importLegacy} />}
        <TaskModal isOpen={modal} onClose={() => setModal(false)} onSave={saveTask} onDelete={id => commit(d => ({ ...d, tasks: d.tasks.filter(t => t.id !== id) }))} initialTask={editing} defaultStatus={defaultStage} teamMembers={data.members} stages={data.stages} busy={busy} error={message} />
      </>}
    </main>
  </div>;
}

