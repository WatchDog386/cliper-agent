import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './theme';
import { AppShell } from './components/AppShell';
import { JobsList } from './components/JobsList';
import { CreateForm } from './components/CreateForm';
import { TabNav } from './components/TabNav';

const queryClient = new QueryClient();

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppShell>
          <TabNav />
          <main className="flex-1 overflow-y-auto p-8">
            <JobsList />
            <CreateForm />
          </main>
        </AppShell>
      </QueryClientProvider>
    </ThemeProvider>
  );
}