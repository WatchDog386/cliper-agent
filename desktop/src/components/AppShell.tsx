import { ReactNode } from 'react';
import { colors, desk } from '../theme';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: colors.bg }}>
      {children}
    </div>
  );
}