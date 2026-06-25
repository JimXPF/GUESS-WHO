import { useCallback, useEffect, useRef, useState } from 'react';
import type { Theme } from '../types';
import { suggestCharacters } from '../api';

export interface SuggestItem {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  theme: Theme;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: (text: string, characterId?: string) => void;
  loading?: boolean;
  /** Mobile sticky footer: open suggestions upward */
  suggestionsPlacement?: 'top' | 'bottom';
}

export default function GuessInput({
  theme,
  value,
  placeholder,
  disabled,
  onChange,
  onSubmit,
  loading,
  suggestionsPlacement = 'bottom',
}: Props) {
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      try {
        const { results } = await suggestCharacters(theme, q);
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIndex(0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    },
    [theme]
  );

  useEffect(() => {
    const t = setTimeout(() => fetchSuggestions(value), 180);
    return () => clearTimeout(t);
  }, [value, fetchSuggestions]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (item: SuggestItem) => {
    onChange(item.label);
    setOpen(false);
    onSubmit(item.label, item.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !suggestions.length) {
      if (e.key === 'Enter' && !loading) onSubmit(value);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-0">
      <input
        ref={inputRef}
        className="input-field w-full text-base min-h-[48px]"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length && setOpen(true)}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {open && suggestions.length > 0 && (
        <ul
          className={`absolute z-50 left-0 right-0 py-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto ${
            suggestionsPlacement === 'top'
              ? 'bottom-full mb-1'
              : 'top-full mt-1'
          }`}
        >
          {suggestions.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between gap-2 hover:bg-apple-blue/5 ${
                  i === activeIndex ? 'bg-apple-blue/10' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
              >
                <span className="font-medium truncate">{item.label}</span>
                {item.sublabel && (
                  <span className="text-xs text-apple-gray shrink-0">{item.sublabel}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
