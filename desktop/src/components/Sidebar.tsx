import { Compass, Film, LogOut, Scissors, Settings, Share2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

export type PageId = 'create' | 'library' | 'scout' | 'channels' | 'settings';

export const PAGE_META: Record<PageId, { title: string; label: string; icon: LucideIcon }> = {
  create: { title: 'Create clips', label: 'Create', icon: Scissors },
  library: { title: 'My clips', label: 'My clips', icon: Film },
  scout: { title: 'Scout', label: 'Scout', icon: Compass },
  channels: { title: 'Channels', label: 'Channels', icon: Share2 },
  settings: { title: 'Settings', label: 'Settings', icon: Settings },
};

const SECTIONS: { label?: string; items: PageId[] }[] = [
  { items: ['create', 'library'] },
  { label: 'Discover', items: ['scout'] },
  { label: 'Account', items: ['channels', 'settings'] },
];

function initials(name: string | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Sidebar({
  page,
  onNavigate,
  user,
  onSignOut,
}: {
  page: PageId;
  onNavigate: (page: PageId) => void;
  user: User | null;
  onSignOut: () => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-nav-bg text-nav-text lg:flex">
      {/* Brand / workspace block */}
      <div className="p-2">
        <button
          type="button"
          onClick={() => onNavigate('create')}
          className="flex w-full items-center gap-2.5 rounded-md bg-nav-hover/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-nav-hover/10"
          aria-label="Cliper Agent home"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Scissors className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[14px] font-semibold text-white">Cliper Agent</span>
            <span className="block truncate text-[11px] text-nav-muted">Clip studio</span>
          </span>
        </button>
      </div>

      <nav className="scrollbar-none flex-1 overflow-y-auto px-2 pb-4 pt-2" aria-label="Main">
        {SECTIONS.map((section, i) => (
          <div key={section.label ?? i} className={cn(i > 0 && 'mt-4')}>
            {section.label && (
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-nav-muted">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((id) => {
                const meta = PAGE_META[id];
                const Icon = meta.icon;
                const active = page === id;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(id)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-9 w-full items-center gap-3 rounded-md px-2 text-[13.5px] transition-colors',
                        active
                          ? 'text-nav-active'
                          : 'text-nav-text hover:bg-nav-hover/5 hover:text-white',
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="truncate">{meta.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-nav-hover/10 px-2 py-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[12px] font-semibold text-white">
            {initials(user?.name)}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-medium text-white">
              {user?.name ?? 'Signed in'}
            </span>
            <span className="block truncate text-[11px] text-nav-muted">
              {user?.role === 'ADMIN' ? 'Administrator' : 'Member'}
            </span>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-8 w-8 items-center justify-center rounded-md text-nav-muted transition-colors hover:bg-nav-hover/10 hover:text-white"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
