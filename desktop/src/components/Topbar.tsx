import { useEffect, useRef, useState } from 'react';
import { Bell, LogOut, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';
import type { Theme } from '@/lib/theme';

function initials(name: string | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Topbar({
  title,
  count,
  user,
  theme,
  onToggleTheme,
  onSignOut,
  onSearch,
  onOpenNotifications,
  unread,
}: {
  title: string;
  count?: number | null;
  user: User | null;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
  onSearch: (query: string) => void;
  onOpenNotifications?: () => void;
  unread?: number;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSearch(query.trim());
    setSearchOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-30 hidden h-14 items-center justify-between gap-4 border-b border-edge bg-surface px-6 lg:flex">
        <h1 className="truncate text-[15px] font-normal text-foreground-2">
          {title}
          {count != null && <span className="text-foreground-3"> - {count}</span>}
        </h1>

        <div className="flex items-center gap-4">
          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            onClick={onToggleTheme}
            className="flex items-center gap-2 text-[13px] font-medium text-accent"
          >
            <span
              className={cn(
                'relative h-5 w-9 rounded-full transition-colors',
                isDark ? 'bg-accent' : 'bg-edge-2',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]',
                  isDark ? 'left-[18px]' : 'left-0.5',
                )}
              />
            </span>
            {isDark ? 'Dark' : 'Light'}
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground-4 transition-colors hover:bg-surface-2 hover:text-foreground"
            aria-label="Search clips"
            title="Search (Ctrl+K)"
          >
            <Search className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </button>

          {onOpenNotifications && (
            <button
              type="button"
              onClick={onOpenNotifications}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground-4 transition-colors hover:bg-surface-2 hover:text-foreground"
              aria-label={unread ? `Notifications (${unread})` : 'Notifications'}
            >
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              {!!unread && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white ring-2 ring-surface">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-surface-2"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-[11.5px] font-semibold text-white">
                {initials(user?.name)}
              </span>
              <span className="hidden max-w-[140px] truncate text-[13px] font-medium text-foreground-2 xl:block">
                {user?.name}
              </span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-11 w-56 overflow-hidden rounded-md border border-edge bg-surface shadow-lift"
              >
                <div className="border-b border-edge px-3.5 py-3">
                  <p className="truncate text-[13px] font-medium text-foreground">{user?.name}</p>
                  <p className="truncate text-[11.5px] text-foreground-4">{user?.email}</p>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] text-foreground-2 transition-colors hover:bg-surface-2"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setSearchOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          <form
            onSubmit={submit}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-md border border-edge bg-surface shadow-lift"
          >
            <div className="flex items-center gap-3 border-b border-edge px-4">
              <Search className="h-[18px] w-[18px] shrink-0 text-foreground-4" strokeWidth={1.75} aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your clips by title, uploader or link…"
                className="h-12 flex-1 bg-transparent text-[13.5px] text-foreground placeholder:text-foreground-5"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded text-foreground-4 hover:bg-surface-2"
                aria-label="Close search"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 text-[11.5px] text-foreground-4">
              <span>Press Enter to search My clips</span>
              <kbd className="rounded border border-edge bg-surface-2 px-1.5 py-0.5 font-sans text-[10.5px]">
                Ctrl K
              </kbd>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
