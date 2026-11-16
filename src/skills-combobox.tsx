import React, { useId, useState } from 'react';
import { normalizeSkills, skillSuggestions } from '../shared/profile';

export function SkillsCombobox({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState('');
  const selected = value.split(/[,\n]/).map(term => term.trim().replace(/\s+/g, ' ')).filter((term, position, terms) => !!term && terms.findIndex(entry => entry.toLowerCase() === term.toLowerCase()) === position);
  const allTerms = [...skillSuggestions, ...selected].filter((term, position, terms) => terms.findIndex(entry => entry.toLowerCase() === term.toLowerCase()) === position);
  const options = allTerms.filter(term => term.toLowerCase().includes(query.trim().toLowerCase()));
  const custom = query.trim().replace(/\s+/g, ' ');
  if (custom && !allTerms.some(term => term.toLowerCase() === custom.toLowerCase())) options.push(custom);
  function toggle(term: string) {
    if (disabled) return;
    try {
      if (/[,\n]/.test(term)) throw new Error('Add one skill at a time.');
      const existing = selected.find(entry => entry.toLowerCase() === term.toLowerCase());
      onChange(normalizeSkills((existing ? selected.filter(entry => entry !== existing) : [...selected, term]).join(', ')).join(', '));
      setQuery(''); setActive(0); setError('');
    } catch (issue) { setError((issue as Error).message); }
  }
  return <div onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <label htmlFor={`${listId}-input`} className="block">Skills</label>
    <p id={`${listId}-help`} className="text-sm">Search or add your own skills. Choose up to 20. Use arrow keys and Enter to select; Escape closes the list.</p>
    <div className="flex gap-2">
      <input id={`${listId}-input`} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && options.length ? `${listId}-${Math.min(active, options.length - 1)}` : undefined} aria-describedby={`${listId}-help`} aria-invalid={!!error} disabled={disabled} maxLength={60} className="block w-full p-3 bg-zinc-900 border border-zinc-600 rounded-lg" value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }} onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); setActive(previous => (previous + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % (options.length || 1)); }
        else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
        else if (event.key === 'Enter') { event.preventDefault(); if (open && options.length) toggle(options[Math.min(active, options.length - 1)]); else setOpen(true); }
        else if (event.key === 'Backspace' && !query && selected.length) { event.preventDefault(); toggle(selected[selected.length - 1]); }
      }} />
      <button type="button" disabled={disabled} aria-label="Toggle skills list" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(previous => !previous)} className="border rounded-lg p-3">▾</button>
    </div>
    {open && <ul id={listId} role="listbox" aria-label="Available skills" aria-multiselectable="true" className="max-h-48 overflow-auto border border-zinc-600 bg-zinc-900 rounded-lg">
      {options.map((term, position) => <li key={term.toLowerCase()} id={`${listId}-${position}`} role="option" aria-selected={selected.some(entry => entry.toLowerCase() === term.toLowerCase())} className={`p-2 cursor-pointer ${position === active ? 'bg-zinc-700' : ''}`} onMouseDown={event => event.preventDefault()} onClick={() => toggle(term)} onMouseMove={() => setActive(position)}>{selected.some(entry => entry.toLowerCase() === term.toLowerCase()) ? '✓ ' : ''}{term === custom && !allTerms.includes(term) ? `Add “${term}”` : term}</li>)}
      {!options.length && <li className="p-2">No matching skills.</li>}
    </ul>}
    <ul aria-label="Selected skills" className="flex flex-wrap gap-2 mt-2">{selected.map(term => <li key={term.toLowerCase()} className="rounded-full bg-zinc-700 px-3 py-1">{term} <button type="button" disabled={disabled} aria-label={`Remove skill ${term}`} onClick={() => toggle(term)}>×</button></li>)}</ul>
    {error && <p role="alert">{error}</p>}
  </div>;
}
