import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, readTheme, type Theme } from '../utils/theme';

export function ThemeSwitch() {
  const [theme, setTheme] = useState(readTheme);
  const select = (value: Theme) => { applyTheme(value); setTheme(value); };
  return <div className="theme-switch" role="group" aria-label="Kolor widoku">
    <button className="icon-button" aria-label="Biały widok" title="Biały widok" aria-pressed={theme === 'light'} onClick={() => select('light')}><Sun size={15} /></button>
    <button className="icon-button" aria-label="Ciemnoszary widok" title="Ciemnoszary widok" aria-pressed={theme === 'dark'} onClick={() => select('dark')}><Moon size={15} /></button>
  </div>;
}
