import { CalendarDays, CheckSquare, ChevronDown, GripVertical, UserRound } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardStage, Task, TeamMember } from '../types/kanban';
import { evaluateDueDate } from '../utils/dateUtils';
export const PRIORITIES = { urgent: 'Pilny', high: 'Wysoki', medium: 'Średni', low: 'Niski' };
interface Props {
  task: Task;
  teamMembers: TeamMember[];
  stages: BoardStage[];
  onEdit: (task: Task) => void;
  onMove: (taskId: string, stageId: string) => void;
  onAssign?: (taskId: string, assigneeId: string | null) => void;
  disabled?: boolean;
  overlay?: boolean;
}
function CardContent({ task, teamMembers, stages, onEdit, onMove, onAssign, disabled, overlay, handle }: Props & { handle?: React.ReactNode }) {
  const person = teamMembers.find(m => m.id === task.assigneeId);
  const due = evaluateDueDate(task.dueDate, task.status === 'done');
  const completed = task.subtasks.filter(s => s.completed).length;
  const total = task.subtasks.length;
  return <>
    <div className="card-top"><span className={'priority ' + task.priority}><span />{PRIORITIES[task.priority]}</span>
      <div className="card-assignee-pill" title={person ? `Osoba: ${person.name} (kliknij, aby zmienić)` : 'Nieprzypisane (kliknij, aby przypisać)'}>
        <span className="avatar small" style={person ? { '--person-color': person.color } as React.CSSProperties : undefined}>
          {person ? person.name.split(' ').map(x => x[0]).slice(0, 2).join('') : <UserRound size={11} />}
        </span>
        <span className="card-assignee-name">{person ? person.name : 'Przypisz'}</span>
        <ChevronDown size={11} className="card-assignee-arrow" />
        {!overlay && (
          <select
            className="card-assignee-select"
            aria-label={'Zmień osobę dla zadania: ' + task.title}
            value={task.assigneeId ?? ''}
            disabled={disabled}
            onChange={e => onAssign?.(task.id, e.target.value || null)}
            onClick={e => e.stopPropagation()}
          >
            <option value="">Nieprzypisane</option>
            {teamMembers.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
      </div>
      {handle}
    </div>
    <button className="card-open" onClick={() => onEdit(task)} disabled={disabled || overlay}><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}</button>
    {task.tags.length > 0 && <div className="card-tags">{task.tags.slice(0, 3).map(t => <span key={t}>{t}</span>)}{task.tags.length > 3 && <span>+{task.tags.length - 3}</span>}</div>}
    {total > 0 && <div className={'card-progress' + (completed === total ? ' complete' : '')}>
      <CheckSquare size={12} aria-hidden="true" />
      <progress value={completed} max={total} aria-label={'Postęp zadania: ' + task.title} aria-valuetext={completed + ' z ' + total + ' podzadań ukończonych'} />
      <span>{completed}/{total}</span>
    </div>}
    <div className="card-footer">
      <span className={due.isOverdue ? 'card-date overdue' : 'card-date'} title={due.badgeText}><CalendarDays size={12} />{task.dueDate ? due.formatted : 'Bez terminu'}</span>
      {!overlay && <select className="card-stage" aria-label={'Przenieś: ' + task.title} value={task.status} disabled={disabled} onChange={e => onMove(task.id, e.target.value)}>{stages.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>}
    </div>
  </>;
}
export function TaskCard(props: Props) {
  const sortable = useSortable({ id: 'task:' + props.task.id, disabled: props.disabled, data: { task: props.task } });
  const due = evaluateDueDate(props.task.dueDate, props.task.status === 'done');
  const deadlineClass = props.task.status === 'done' ? '' : due.isOverdue ? ' deadline-overdue' : due.isToday ? ' deadline-today' : '';
  return <article ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className={'task-card' + deadlineClass + (sortable.isDragging ? ' dragging' : '')}>
    <CardContent {...props} handle={<button ref={sortable.setActivatorNodeRef} className="drag-handle" {...sortable.attributes} {...sortable.listeners} aria-label={'Przeciągnij: ' + props.task.title} disabled={props.disabled} title="Przeciągnij lub użyj spacji i strzałek"><GripVertical size={17} /></button>} />
  </article>;
}
export function TaskOverlay(props: Props) { return <article className="task-card drag-overlay"><CardContent {...props} overlay handle={<GripVertical size={17} />} /></article>; }

