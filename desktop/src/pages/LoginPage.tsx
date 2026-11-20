import { useEffect, useState } from 'react';
import { Scissors } from 'lucide-react';
import { api, errorMessage, setStoredUser, setToken } from '@/lib/api';
import type { AppConfig, AuthResult } from '@/lib/types';
import { Alert, Button, Input, Label, Spinner } from '@/components/ui';

export function LoginPage({ onSignedIn }: { onSignedIn: (result: AuthResult) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    api<AppConfig>('/config').then(setConfig, () => undefined);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result =
        mode === 'login'
          ? await api<AuthResult>('/auth/login', { method: 'POST', body: { email, password } })
          : await api<AuthResult>('/auth/register', { method: 'POST', body: { name, email, password } });
      setToken(result.token);
      setStoredUser(result.user);
      onSignedIn(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-surface px-6 py-16">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Scissors className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <span className="text-xl font-semibold tracking-tight text-foreground">Cliper Agent</span>
        </div>

        <h1 className="mt-10 text-center text-3xl font-normal tracking-tight text-foreground">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mt-1 text-center text-[13px] text-foreground-4">
          {mode === 'login'
            ? 'Sign in to clip and post your videos.'
            : 'The first account on a new server becomes the admin.'}
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
          {error && <Alert>{error}</Alert>}

          {mode === 'register' && (
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-11 rounded-lg border-transparent bg-surface-3 px-4"
                required
              />
            </div>
          )}

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 rounded-lg border-transparent bg-surface-3 px-4"
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 rounded-lg border-transparent bg-surface-3 px-4"
              required
              minLength={8}
            />
            {mode === 'register' && (
              <p className="mt-1 text-[11.5px] text-foreground-4">
                8+ characters with a letter and a number.
              </p>
            )}
          </div>

          <Button type="submit" size="lg" loading={busy} className="mt-1 w-full rounded-lg">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        {mode === 'login' && config?.allowSignup && (
          <p className="mt-6 text-center text-[13px] text-foreground-3">
            New here?{' '}
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className="font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              Create an account
            </button>
          </p>
        )}
        {mode === 'register' && (
          <p className="mt-6 text-center text-[13px] text-foreground-3">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className="font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              Sign in
            </button>
          </p>
        )}

        <p className="mt-10 text-center text-[11px] text-foreground-5">
          Paste a video link. Get ready-to-post clips, sized for phone or desktop.
        </p>
        {busy && <Spinner className="sr-only" />}
      </div>
    </div>
  );
}
