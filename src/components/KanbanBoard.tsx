import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, closestCorners, pointerWithin, rectIntersection, useSensor, useSensors, type DragEndEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { GripVertical, ListFilter, Plus, Search, X } from 'lucide-react';
import type { BoardData, Task } from '../types/kanban';
import { evaluateDueDate } from '../utils/dateUtils';
import { STAGE_COLORS } from '../utils/board';
import { KanbanColumn } from './KanbanColumn';
import { TaskOverlay, PRIORITIES } from './TaskCard';
interface Props { data: BoardData; onEdit: (task: Task) => void; onNew: (stage: string) => void; onMove: (id: string, stage: string, before?: string) => void; onAssign?: (id: string, assigneeId: string | null) => void; onAddStage: (name: string, color: string) => Promise<boolean>; onMoveStage: (id: string, target: string) => void; onStageColor: (id: string, color: string) => Promise<boolean>; disabled: boolean; }
// Both sortable levels share one context. Keyboard targets must stay in the active level.
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const column = String(args.active).startsWith('column:');
  const droppableRects = new Map([...args.context.droppableRects].filter(([id]) =>
    String(id).startsWith('column:') === column && !(String(id).startsWith('stage:') && args.context.droppableContainers.get(id)?.data.current?.hasTasks)
  ));
  return sortableKeyboardCoordinates(event, { ...args, context: { ...args.context, droppableRects } });
};
export function KanbanBoard({ data, onEdit, onNew, onMove, onAssign, onAddStage, onMoveStage, onStageColor, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [person, setPerson] = useState('');
  const [priority, setPriority] = useState('');
  const [deadline, setDeadline] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(STAGE_COLORS[3]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }));
  const visible = useMemo(() => data.tasks.filter(t => {
    const due = evaluateDueDate(t.dueDate, t.status === 'done');
    return (!query || (t.title + ' ' + t.description + ' ' + t.tags.join(' ')).toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl')))
      && (!person || (person === 'unassigned' ? !t.assigneeId : t.assigneeId === person))
      && (!priority || priority === t.priority)
      && (!deadline || (t.status !== 'done' && (deadline === 'overdue' ? due.isOverdue : due.isToday)));
  }), [data.tasks, query, person, priority, deadline]);
  const activeTask = activeId?.startsWith('task:') ? data.tasks.find(t => t.id === activeId.slice(5)) : undefined;
  const activeStage = activeId?.startsWith('column:') ? data.stages.find(s => s.id === activeId.slice(7)) : undefined;
  const drop = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || over.id === active.id || disabled) return;
    if (String(active.id).startsWith('column:')) {
      if (String(over.id).startsWith('column:')) onMoveStage(String(active.id).slice(7), String(over.id).slice(7));
      return;
    }
    const taskId = String(active.id).slice(5);
    const task = data.tasks.find(t => t.id === taskId);
    if (!task) return;
    if (String(over.id).startsWith('stage:')) { onMove(taskId, String(over.id).slice(6)); return; }
    const target = data.tasks.find(t => t.id === String(over.id).slice(5));
    if (!target) return;
    const peers = data.tasks.filter(t => t.status === target.status);
    const sourceIndex = peers.findIndex(t => t.id === taskId);
    const targetIndex = peers.findIndex(t => t.id === target.id);
    const before = sourceIndex >= 0 && sourceIndex < targetIndex ? peers[targetIndex + 1]?.id : target.id;
    onMove(taskId, target.status, before);
  };
  return <>
    <div className="board-toolbar"><label className="search-field"><Search size={16} /><input aria-label="Szukaj zadań" placeholder="Szukaj zadań, tagów…" value={query} onChange={e => setQuery(e.target.value)} /></label><span className="filter-icon"><ListFilter size={16} /></span>
      <select aria-label="Filtr osoby" value={person} onChange={e => setPerson(e.target.value)}><option value="">Wszystkie osoby</option><option value="unassigned">Nieprzypisane</option>{data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <select aria-label="Filtr priorytetu" value={priority} onChange={e => setPriority(e.target.value)}><option value="">Każdy priorytet</option>{Object.entries(PRIORITIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      <select aria-label="Filtr terminu" value={deadline} onChange={e => setDeadline(e.target.value)}><option value="">Każdy termin</option><option value="overdue">Po terminie</option><option value="today">Na dziś</option></select>
      {(query || person || priority || deadline) && <button className="icon-button" aria-label="Wyczyść filtry" onClick={() => { setQuery(''); setPerson(''); setPriority(''); setDeadline(''); }}><X size={16} /></button>}
      <button className="button stage-button" onClick={() => setAdding(!adding)} disabled={disabled || data.stages.length >= 20}><Plus size={15} />Dodaj etap</button>
    </div>
    {adding && <form className="stage-form" onSubmit={async e => { e.preventDefault(); if (await onAddStage(name, color)) { setAdding(false); setName(''); } }}><label>Nazwa etapu<input aria-label="Nazwa etapu" value={name} onChange={e => setName(e.target.value)} maxLength={48} placeholder="np. Do sprawdzenia" required autoFocus /></label><fieldset className="stage-colors"><legend>Kolor</legend>{STAGE_COLORS.map(c => <label key={c} title={c} style={{ background: c }}><input type="radio" name="stage-color" value={c} checked={c === color} onChange={() => setColor(c)} aria-label={'Kolor ' + c} /></label>)}</fieldset><button className="button primary" disabled={disabled}>Dodaj etap do tablicy</button><button type="button" className="icon-button" aria-label="Anuluj dodawanie etapu" onClick={() => setAdding(false)}><X size={18} /></button></form>}
    <DndContext sensors={sensors} collisionDetection={args => {
      const column = String(args.active.id).startsWith('column:');
      const candidates = { ...args, droppableContainers: args.droppableContainers.filter(c =>
        String(c.id).startsWith('column:') === column && !(!args.pointerCoordinates && String(c.id).startsWith('stage:') && c.data.current?.hasTasks)
      ) };
      if (column) return closestCenter(candidates);
      const hits = args.pointerCoordinates ? pointerWithin(candidates) : rectIntersection(candidates);
      const cards = hits.filter(h => String(h.id).startsWith('task:'));
      return cards.length ? cards : hits.length ? hits : closestCorners(candidates);
    }} onDragStart={({ active }) => setActiveId(String(active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={drop} accessibility={{ screenReaderInstructions: { draggable: 'Spacja rozpoczyna przenoszenie. Strzałki wybierają miejsce. Spacja zatwierdza, Escape anuluje.' } }}>
      <SortableContext items={data.stages.map(s => 'column:' + s.id)} strategy={horizontalListSortingStrategy}>
        <div className="board-scroll"><div className="kanban-grid" style={{ gridTemplateColumns: 'repeat(' + data.stages.length + ', minmax(250px, 1fr))' }}>{data.stages.map(stage => <KanbanColumn key={stage.id} stage={stage} stages={data.stages} tasks={visible.filter(t => t.status === stage.id)} total={data.tasks.filter(t => t.status === stage.id).length} members={data.members} onNew={onNew} onEdit={onEdit} onMove={onMove} onAssign={onAssign} onMoveStage={onMoveStage} onStageColor={onStageColor} disabled={disabled} />)}</div></div>
      </SortableContext>
      <DragOverlay>{activeTask ? <TaskOverlay task={activeTask} teamMembers={data.members} stages={data.stages} onEdit={onEdit} onMove={onMove} /> : activeStage ? <section className="kanban-column column-overlay" style={{ '--stage-color': activeStage.color } as React.CSSProperties}>
        <div className="column-heading"><GripVertical size={16} /><span className="stage-dot" /><h2>{activeStage.title}</h2><span className="count">{data.tasks.filter(t => t.status === activeStage.id).length}</span></div>
        <div className="column-cards">{visible.filter(t => t.status === activeStage.id).map(t => <div className="task-card" key={t.id}>{t.title}</div>)}</div>
      </section> : null}</DragOverlay>
    </DndContext>
    <div className="board-foot"><span>{visible.length} z {data.tasks.length} zadań</span><span>Przeciągaj zadania i etapy za uchwyt · Spacja + strzałki · Kolory w menu etapu</span></div>
  </>;
}

