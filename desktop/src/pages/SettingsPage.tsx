import { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, HardDrive, LogOut, Server, UserRound, XCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { SystemInfo, User } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  Spinner,
} from '@/components/ui';
import type { Theme } from '@/lib/theme';

export function SettingsPage({
  user,
  theme,
  onToggleTheme,
  onSignOut,
}: {
  user: User | null;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<SystemInfo>('/system')
      .then(setSystem)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-enter">
      <PageHeader title="Settings" description="Your account, appearance and the server doing the rendering." />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Signed in to this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-[14px] font-semibold text-white">
                {(user?.name ?? '?')
                  .split(' ')
                  .map((part) => part.charAt(0))
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-foreground">{user?.name}</p>
                <p className="truncate text-[12px] text-foreground-4">{user?.email}</p>
              </div>
              <Badge variant={user?.role === 'ADMIN' ? 'default' : 'secondary'} className="ml-auto">
                {user?.role === 'ADMIN' ? 'Administrator' : 'Member'}
              </Badge>
            </div>

            <div className="flex items-center justify-between rounded-md border border-edge bg-surface-2 px-3.5 py-3">
              <div>
                <p className="text-[13px] font-medium text-foreground">Appearance</p>
                <p className="text-[11.5px] text-foreground-4">Light or dark, remembered on this computer.</p>
              </div>
              <Button variant="outline" size="sm" onClick={onToggleTheme}>
                {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-edge pt-3.5">
              <p className="text-[11.5px] text-foreground-4">Your jobs and clips stay on the server.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={onSignOut}
                className="text-danger-text hover:border-danger-border hover:bg-danger-soft"
              >
                <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Server</CardTitle>
            <CardDescription>Tools and workers on the machine that renders clips.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && <Alert>{error}</Alert>}
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-[12.5px] text-foreground-4">
                <Spinner className="h-4 w-4" /> Checking the server…
              </div>
            ) : system ? (
              <>
                <div className="space-y-1.5">
                  {Object.entries(system.tools).map(([name, tool]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between rounded-md border border-edge bg-surface px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-[12.5px] font-medium text-foreground-2">
                        {tool.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                        ) : (
                          <XCircle className="h-4 w-4 text-danger" aria-hidden />
                        )}
                        {name}
                      </span>
                      <span className="truncate text-[11px] text-foreground-4">
                        {tool.ok ? tool.version ?? 'installed' : 'not found'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <InfoTile
                    icon={Server}
                    label="Queue"
                    value={`${system.queue.running} / ${system.queue.concurrency}`}
                  />
                  <InfoTile
                    icon={Cpu}
                    label="Encoder"
                    value={system.encoder.active || 'software'}
                    hint={system.encoder.hardware ? 'Hardware acceleration' : 'CPU only'}
                  />
                  <InfoTile
                    icon={HardDrive}
                    label="Parallel renders"
                    value={String(system.encoder.parallel)}
                  />
                  <InfoTile
                    icon={UserRound}
                    label="Publisher"
                    value={`${system.publisher.running} / ${system.publisher.concurrency}`}
                  />
                </div>

                {system.encoder.note && (
                  <p className="text-[11.5px] leading-relaxed text-foreground-4">{system.encoder.note}</p>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-edge bg-surface px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] text-foreground-4">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        {label}
      </p>
      <p className="mt-0.5 text-[14px] font-semibold capitalize tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-[10.5px] text-foreground-4">{hint}</p>}
    </div>
  );
}
