export type Theme = 'light' | 'dark';
const key = 'kanban-theme';

export function readTheme(): Theme {
  try { return localStorage.getItem(key) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(key, theme); } catch { /* The switch still works when storage is unavailable. */ }
}
