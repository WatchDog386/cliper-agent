import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Link2, RefreshCw, Share2, Trash2, TriangleAlert } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { SocialAccount, SocialProvider } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Spinner,
} from '@/components/ui';

const PLATFORM_STYLE: Record<string, { bg: string; label: string }> = {
  youtube: { bg: 'bg-[#FF0000]', label: 'YouTube' },
  tiktok: { bg: 'bg-[#111111]', label: 'TikTok' },
  instagram: { bg: 'bg-[#E1306C]', label: 'Instagram' },
  facebook: { bg: 'bg-[#1877F2]', label: 'Facebook' },
  x: { bg: 'bg-[#111111]', label: 'X' },
  linkedin: { bg: 'bg-[#0A66C2]', label: 'LinkedIn' },
};

export function ChannelsPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [accountsResult, providersResult] = await Promise.all([
        api<{ accounts: SocialAccount[] }>('/social/accounts'),
        api<{ providers: SocialProvider[] }>('/social/providers'),
      ]);
      setAccounts(accountsResult.accounts);
      setProviders(providersResult.providers);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async (platform: string) => {
    setBusy(platform);
    setError('');
    try {
      const result = await api<{ url: string }>(`/social/connect/${platform}`, {
        method: 'POST',
        body: { returnTo: `${window.location.origin}/` },
      });
      window.location.assign(result.url);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  const disconnect = async (account: SocialAccount) => {
    if (!window.confirm(`Disconnect ${account.name}? Waiting posts for this account are cancelled.`)) return;
    setBusy(account.id);
    setError('');
    try {
      await api(`/social/accounts/${account.id}`, { method: 'DELETE' });
      setAccounts((current) => current.filter((item) => item.id !== account.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page-enter">
      <PageHeader
        title="Channels"
        description="Connect accounts once, then post clips to several of them in one go."
        actions={
          <Button variant="outline" onClick={() => void load()} loading={loading}>
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Refresh
          </Button>
        }
      />

      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Connected accounts</CardTitle>
            <CardDescription>Tokens are stored on the server and never shown here.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-[12.5px] text-foreground-4">
                <Spinner className="h-4 w-4" /> Loading accounts…
              </div>
            ) : accounts.length === 0 ? (
              <EmptyState
                icon={Share2}
                title="No accounts connected"
                description="Connect a platform on the right to start posting clips."
              />
            ) : (
              <div className="space-y-2">
                {accounts.map((account) => {
                  const style = PLATFORM_STYLE[account.platform] ?? { bg: 'bg-brand-600', label: account.platform };
                  return (
                    <div
                      key={account.id}
                      className="flex items-center gap-3 rounded-md border border-edge bg-surface px-3.5 py-3"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white ${style.bg}`}
                      >
                        {style.label.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-medium text-foreground">{account.name}</p>
                          {account.needsReconnect ? (
                            <Badge variant="warning">Reconnect</Badge>
                          ) : (
                            <Badge variant="success">
                              <CheckCircle2 className="h-3 w-3" aria-hidden />
                              Connected
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-[11.5px] text-foreground-4">
                          {style.label}
                          {account.handle ? ` · @${account.handle.replace(/^@/, '')}` : ''} · added{' '}
                          {timeAgo(account.connectedAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void disconnect(account)}
                        loading={busy === account.id}
                        className="text-foreground-4 hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Disconnect
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add a channel</CardTitle>
            <CardDescription>The server must have keys for a platform before it can connect.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {providers.map((provider) => {
              const style = PLATFORM_STYLE[provider.platform] ?? { bg: 'bg-brand-600', label: provider.label };
              return (
                <div
                  key={provider.platform}
                  className="flex items-center gap-3 rounded-md border border-edge bg-surface px-3 py-2.5"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white ${style.bg}`}
                  >
                    {style.label.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground">{provider.label}</p>
                    <p className="text-[11px] text-foreground-4">
                      {provider.configured ? `Up to ${provider.limits?.caption ?? '—'} chars` : 'Not configured'}
                    </p>
                  </div>
                  {provider.configured ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void connect(provider.platform)}
                      loading={busy === provider.platform}
                    >
                      <Link2 className="h-3.5 w-3.5" aria-hidden />
                      Connect
                    </Button>
                  ) : (
                    <span
                      className="flex items-center gap-1 text-[11px] text-warning-text"
                      title={provider.envNames?.join(', ')}
                    >
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                      Keys needed
                    </span>
                  )}
                </div>
              );
            })}
            {!loading && providers.length === 0 && (
              <p className="py-4 text-center text-[12.5px] text-foreground-4">
                No providers are available on this server.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
