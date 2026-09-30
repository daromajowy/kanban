// Separate development entry. Vite's production build includes index.html only.
import { createRoot } from 'react-dom/client';
import { Workspace, type BoardRepository } from '../src/components/Workspace';
import { emptyBoard } from '../src/utils/board';
import { RevisionConflictError } from '../src/utils/supabase';
import type { BoardData } from '../src/types/kanban';
import '../src/index.css';
import { applyTheme, readTheme } from '../src/utils/theme';
applyTheme(readTheme());
const data: BoardData = {
  ...emptyBoard(),
  members: [{ id: 'demo-1', name: 'Jan', email: '', role: 'Projekt', color: '#0d9488', status: 'active' }, { id: 'demo-2', name: 'Darek', email: '', role: 'Realizacja', color: '#6366f1', status: 'active' }],
  tasks: ['Przygotować ofertę oświetlenia', 'Materiały do nowej strony', 'Sprawdzić układ panelu JUNG', 'Zdjęcia realizacji: biuro', 'Uzupełnić specyfikację techniczną', 'Podsumowanie spotkania'].map((title, i) => ({
    id: 'demo-task-' + i, title, description: ['Zebrać warianty opraw i przygotować porównanie dla klienta.', 'Komplet treści do sekcji o inteligentnych wnętrzach.', 'Weryfikacja scen i opisów przycisków przed odbiorem.'][i % 3], status: i < 2 ? 'todo' : i < 5 ? 'in_progress' : 'done', priority: i === 0 ? 'urgent' : i === 2 ? 'high' : 'medium', dueDate: '2026-10-02T14:00', assigneeId: 'demo-' + (i % 2 + 1), tags: [['Oferta', 'Oświetlenie'], ['Strona', 'Treści'], ['JUNG', 'Projekt']][i % 3], subtasks: [{ id: 'step-' + i, title: 'Sprawdzić materiały', completed: i % 2 === 0 }], createdAt: '2026-09-29', updatedAt: '2026-09-29'
  })),
};
let snapshot = { data, revision: 0 };
const repository: BoardRepository = {
  load: async () => structuredClone(snapshot),
  save: async (data, revision) => { if (revision !== snapshot.revision) throw new RevisionConflictError('Odśwież tablicę.'); snapshot = { data: structuredClone(data), revision: revision + 1 }; return structuredClone(snapshot); },
};
createRoot(document.getElementById('root')!).render(<Workspace user={{ id: 'demo', name: 'Jan', email: 'demo@example.invalid', role: 'admin' }} repository={repository} onLogout={() => location.assign('/')} onAccessLost={() => location.assign('/')} />);

