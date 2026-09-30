import { useRef } from 'react';
import { ArrowLeft, ArrowRight, Check, GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardStage, Task, TeamMember } from '../types/kanban';
import { STAGE_COLORS } from '../utils/board';
import { TaskCard } from './TaskCard';
interface Props { stage: BoardStage; stages: BoardStage[]; tasks: Task[]; total: number; members: TeamMember[]; onNew: (id: string) => void; onEdit: (task: Task) => void; onMove: (id: string, stage: string) => void; onAssign?: (id: string, assigneeId: string | null) => void; onMoveStage: (id: string, target: string) => void; onStageColor: (id: string, color: string) => Promise<boolean>; disabled: boolean; }
const colorNames = ['Indygo', 'Bursztynowy', 'Zielony', 'Różowy', 'Niebieski', 'Szary', 'Pomarańczowy', 'Turkusowy'];
export function KanbanColumn({ stage, stages, tasks, total, members, onNew, onEdit, onMove, onAssign, onMoveStage, onStageColor, disabled }: Props) {
  const sortable = useSortable({ id: 'column:' + stage.id, disabled });
  const { setNodeRef, isOver } = useDroppable({ id: 'stage:' + stage.id, disabled, data: { hasTasks: tasks.length > 0 } });
  const menu = useRef<HTMLDetailsElement>(null);
  const index = stages.findIndex(s => s.id === stage.id);
  const closeMenu = () => { if (menu.current) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); } };
  return <section ref={sortable.setNodeRef} className={'kanban-column' + (isOver ? ' drop-target' : '') + (sortable.isDragging ? ' column-dragging' : '')} aria-label={stage.title} style={{ '--stage-color': stage.color, transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition } as React.CSSProperties}>
    <div className="column-heading">
      <button ref={sortable.setActivatorNodeRef} className="drag-handle column-grip" {...sortable.attributes} {...sortable.listeners} aria-label={'Przeciągnij etap: ' + stage.title} title="Przeciągnij etap lub użyj spacji i strzałek" disabled={disabled}><GripVertical size={16} /></button>
      <span className="stage-dot" /><h2 title={stage.title}>{stage.title}</h2><span className="count">{tasks.length}{tasks.length !== total && '/' + total}</span>
      <details ref={menu} name="stage-settings" className="stage-menu" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); } }}>
        <summary className="icon-button" aria-label={'Ustawienia etapu: ' + stage.title} title="Kolor i kolejność etapu"><MoreHorizontal size={17} /></summary>
        <div className="stage-popover">
          <fieldset disabled={disabled}><legend>Kolor etapu</legend><div className="stage-palette">{STAGE_COLORS.map((c, i) => <button type="button" key={c} aria-label={colorNames[i]} aria-pressed={c === stage.color} title={colorNames[i]} style={{ background: c }} onClick={async () => { if (await onStageColor(stage.id, c)) closeMenu(); }}>{c === stage.color && <Check size={15} />}</button>)}</div></fieldset>
          <div className="stage-order"><button className="button" disabled={disabled || index === 0} aria-label={'Przesuń etap w lewo: ' + stage.title} onClick={() => { onMoveStage(stage.id, stages[index - 1].id); closeMenu(); }}><ArrowLeft size={14} />W lewo</button><button className="button" disabled={disabled || index === stages.length - 1} aria-label={'Przesuń etap w prawo: ' + stage.title} onClick={() => { onMoveStage(stage.id, stages[index + 1].id); closeMenu(); }}>W prawo<ArrowRight size={14} /></button></div>
        </div>
      </details>
      <button className="icon-button" onClick={() => onNew(stage.id)} disabled={disabled} aria-label={'Dodaj zadanie: ' + stage.title}><Plus size={16} /></button>
    </div>
    <SortableContext items={tasks.map(t => 'task:' + t.id)} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className="column-cards">{tasks.map(task => <TaskCard key={task.id} task={task} stages={stages} teamMembers={members} onEdit={onEdit} onMove={onMove} onAssign={onAssign} disabled={disabled} />)}
        {!tasks.length && <p className="column-empty">{total ? 'Brak wyników dla tych filtrów' : 'Przenieś tutaj zadanie'}</p>}
      </div>
    </SortableContext>
    <button className="column-add" onClick={() => onNew(stage.id)} disabled={disabled}><Plus size={15} />Dodaj zadanie</button>
  </section>;
}

