import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Scissors, X } from 'lucide-react';
import { api, clearSession, errorMessage, getStoredUser, getToken, setStoredUser } from '@/lib/api';
import type { AppConfig, AuthResult, Job, JobStats, User } from '@/lib/types';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Sidebar, PAGE_META, type PageId } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui';
import { LoginPage } from '@/pages/LoginPage';
import { CreatePage } from '@/pages/CreatePage';
import { LibraryPage } from '@/pages/LibraryPage';
import { ScoutPage } from '@/pages/ScoutPage';
import { ChannelsPage } from '@/pages/ChannelsPage';
import { SettingsPage } from '@/pages/SettingsPage';

type Filter = 'all' | 'active' | 'done' | 'failed';

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  action: () => Promise<void> | void;
};

type ToastState = { message: string; tone: 'success' | 'danger' } | null;

export default function App() {
  const { theme, toggle } = useTheme();
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(() => (getToken() ? getStoredUser<User>() : null));
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [page, setPage] = useState<PageId>('create');
  const [createSeed, setCreateSeed] = useState<{ url: string; key: number } | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(false);
  const filterRef = useRef<Filter>('all');

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((message: string, tone: 'success' | 'danger' = 'success') => {
    setToast({ message, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  /* ------------------------------- Session ------------------------------- */

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setJobs([]);
    };
    window.addEventListener('cliper:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cliper:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!getToken()) {
        setBooting(false);
        return;
      }
      try {
        const result = await api<{ user: User }>('/auth/me');
        if (cancelled) return;
        setUser(result.user);
        setStoredUser(result.user);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    api<AppConfig>('/config').then(setConfig, () => undefined);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const connected = hash.get('connected');
    const failure = hash.get('error');
    if (!connected && !failure) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setPage('channels');
    if (connected) {
      const name = hash.get('name');
      notify(`${connected} connected${name ? ` (${name})` : ''}`);
    } else if (failure) {
      notify(failure, 'danger');
    }
  }, [user, notify]);

  const onSignedIn = (result: AuthResult) => {
    setUser(result.user);
    setConfig(null);
    setPage('create');
  };

  const signOut = () => {
    clearSession();
    setUser(null);
    setJobs([]);
    setStats(null);
  };

  /* -------------------------------- Jobs -------------------------------- */

  const loadJobs = useCallback(
    async (status: Filter, silent = false) => {
      if (!silent) setLoadingJobs(true);
      try {
        const result = await api<{ jobs: Job[]; stats: JobStats }>(`/jobs?status=${status}`);
        setJobs(result.jobs);
        setStats(result.stats);
      } catch (err) {
        if (!silent) notify(errorMessage(err), 'danger');
      } finally {
        if (!silent) setLoadingJobs(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    if (!user) return;
    void loadJobs(filter);
  }, [user, filter, loadJobs]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      void loadJobs(filterRef.current, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [user, loadJobs]);

  const afterChange = async (message: string) => {
    notify(message);
    await loadJobs(filterRef.current, true);
  };

  const redo = (job: Job) => {
    setConfirm({
      title: 'Re-clip this video?',
      message: 'A new job starts with the same source and settings. The original job is kept.',
      confirmLabel: 'Re-clip',
      action: async () => {
        await api(`/jobs/${job.id}/reclip`, { method: 'POST', body: { options: job.options } });
        await afterChange('New job started');
      },
    });
  };

  const remove = (job: Job) => {
    setConfirm({
      title: 'Delete this job?',
      message: 'The job and all of its clips and files are removed. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
      action: async () => {
        await api(`/jobs/${job.id}`, { method: 'DELETE' });
        await afterChange('Job deleted');
      },
    });
  };

  const retry = (job: Job) => {
    setConfirm({
      title: 'Run this job again?',
      message: 'The same source and settings are queued once more.',
      confirmLabel: 'Retry',
      action: async () => {
        await api(`/jobs/${job.id}/retry`, { method: 'POST' });
        await afterChange('Job queued again');
      },
    });
  };

  const cancel = (job: Job) => {
    setConfirm({
      title: 'Stop this job?',
      message: 'Rendering stops and any finished clips are kept.',
      confirmLabel: 'Stop job',
      tone: 'danger',
      action: async () => {
        await api(`/jobs/${job.id}/cancel`, { method: 'POST' });
        await afterChange('Job stopped');
      },
    });
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      await confirm.action();
      setConfirm(null);
    } catch (err) {
      notify(errorMessage(err), 'danger');
      setConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  /* -------------------------------- Render -------------------------------- */

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Scissors className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage onSignedIn={onSignedIn} />;

  const go = (next: PageId) => {
    setPage(next);
    if (next !== 'library') setSearch('');
    window.scrollTo({ top: 0 });
  };

  const startClip = (url: string) => {
    setCreateSeed({ url, key: Date.now() });
    setPage('create');
  };

  const meta = PAGE_META[page];

  return (
    <div className="flex min-h-screen bg-[#f7f8fa] dark:bg-[#121212]">
      <Sidebar page={page} onNavigate={go} user={user} onSignOut={signOut} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={meta.title}
          count={page === 'library' ? jobs.length : null}
          user={user}
          theme={theme}
          onToggleTheme={toggle}
          onSignOut={signOut}
          onSearch={(query) => {
            setSearch(query);
            setPage('library');
          }}
        />

        {/* Compact header for narrow windows */}
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-edge bg-surface px-4 py-2.5 lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Scissors className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <span className="text-[14px] font-semibold text-foreground">Cliper Agent</span>
          <div className="scrollbar-none ml-auto flex items-center gap-1 overflow-x-auto">
            {(Object.keys(PAGE_META) as PageId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                className={cn(
                  'h-8 shrink-0 rounded-md px-2.5 text-[12.5px] font-medium',
                  page === id ? 'bg-accent-soft text-accent-text' : 'text-foreground-3',
                )}
              >
                {PAGE_META[id].label}
              </button>
            ))}
          </div>
        </div>

        <main className="min-w-0 flex-1 px-6 py-6">
          <div className="mx-auto w-full max-w-[1400px]">
            {page === 'create' && (
              <CreatePage
                key={createSeed?.key ?? 'new'}
                config={config}
                initialUrl={createSeed?.url}
                onCreated={(job) => {
                  notify(`“${job.title}” queued`);
                  setPage('library');
                  void loadJobs(filterRef.current, true);
                }}
              />
            )}
            {page === 'library' && (
              <LibraryPage
                jobs={jobs}
                stats={stats}
                loading={loadingJobs}
                filter={filter}
                onFilterChange={setFilter}
                search={search}
                onSearchChange={setSearch}
                onRefresh={() => void loadJobs(filter)}
                onNew={() => go('create')}
                onRedo={redo}
                onDelete={remove}
                onRetry={retry}
                onCancel={cancel}
              />
            )}
            {page === 'scout' && <ScoutPage onClip={startClip} />}
            {page === 'channels' && <ChannelsPage />}
            {page === 'settings' && (
              <SettingsPage user={user} theme={theme} onToggleTheme={toggle} onSignOut={signOut} />
            )}
          </div>
        </main>

        <footer className="border-t border-edge px-6 py-3 text-[11.5px] text-foreground-5">
          Cliper Agent · Paste a link, get ready-to-post clips
        </footer>
      </div>

      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={confirm.title}
          onClick={() => !confirmBusy && setConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-md border border-edge bg-surface p-5 shadow-lift"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  confirm.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent',
                )}
              >
                <AlertCircle className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">{confirm.title}</h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-foreground-4">{confirm.message}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)} disabled={confirmBusy}>
                Cancel
              </Button>
              <Button
                variant={confirm.tone === 'danger' ? 'destructive' : 'default'}
                onClick={() => void runConfirm()}
                loading={confirmBusy}
              >
                {confirm.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-fade-up">
          <div className="flex items-center gap-2.5 rounded-md border border-edge bg-surface px-4 py-3 shadow-lift">
            {toast.tone === 'danger' ? (
              <AlertCircle className="h-4 w-4 text-danger" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            )}
            <p className="max-w-xs text-[12.5px] font-medium text-foreground">{toast.message}</p>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-1 flex h-6 w-6 items-center justify-center rounded text-foreground-4 hover:bg-surface-2"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
