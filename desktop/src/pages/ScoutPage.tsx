import { useCallback, useEffect, useState } from 'react';
import { Clock, Compass, Eye, RefreshCw, Scissors, Search, TriangleAlert } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { DiscoverCategory, DiscoverItem } from '@/lib/types';
import { cn, formatClock, formatCompact } from '@/lib/utils';
import {
  Alert,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  PageHeader,
  Spinner,
} from '@/components/ui';

export function ScoutPage({ onClip }: { onClip: (url: string) => void }) {
  const [categories, setCategories] = useState<DiscoverCategory[]>([]);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [source, setSource] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ categories: DiscoverCategory[] }>('/discover/categories')
      .then((result) => setCategories(result.categories))
      .catch(() => undefined);
  }, []);

  const load = useCallback(
    async (categoryId: string, search: string) => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ category: categoryId });
        if (search.trim()) params.set('q', search.trim());
        const result = await api<{ source: string; items: DiscoverItem[] }>(`/discover?${params}`);
        setItems(result.items);
        setSource(result.source);
      } catch (err) {
        setError(errorMessage(err));
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(category, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return (
    <div className="page-enter">
      <PageHeader
        title="Scout"
        description="Videos and creators worth clipping right now, from YouTube and Twitch."
        actions={
          <Button variant="outline" onClick={() => void load(category, query)} loading={loading}>
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Refresh
          </Button>
        }
      />

      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id)}
              className={cn(
                'h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors',
                category === item.id
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 text-foreground-3 hover:bg-surface-3 hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <form
          className="relative w-72"
          onSubmit={(event) => {
            event.preventDefault();
            void load(category, query);
          }}
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-5"
            strokeWidth={1.75}
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a game, creator or event"
            className="pl-9"
            aria-label="Search trending videos"
          />
        </form>
      </Card>

      {error && <Alert className="mb-4">{error}</Alert>}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-foreground-4">
            <Spinner className="h-4 w-4" /> Finding videos worth clipping…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="Nothing found"
          description="Try another category or a different search."
        />
      ) : (
        <>
          <p className="mb-3 text-[11.5px] text-foreground-4">
            {source === 'youtube-trending'
              ? 'YouTube most popular chart'
              : 'YouTube search results'}{' '}
            · {items.length} videos
          </p>
          <div className="grid grid-cols-4 gap-4">
            {items.map((item) => (
              <Card key={item.id} className="group overflow-hidden">
                <div className="relative aspect-video bg-surface-3">
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-foreground-5">
                      <Compass className="h-6 w-6" aria-hidden />
                    </div>
                  )}
                  {item.duration != null && (
                    <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                      <Clock className="h-2.5 w-2.5" aria-hidden />
                      {formatClock(item.duration)}
                    </span>
                  )}
                </div>
                <CardContent className="space-y-2 p-3">
                  <p className="line-clamp-2 min-h-[34px] text-[12.5px] font-medium leading-snug text-foreground">
                    {item.title}
                  </p>
                  <p className="truncate text-[11px] text-foreground-4">{item.channel ?? 'Unknown channel'}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-[11px] tabular-nums text-foreground-4">
                      <Eye className="h-3 w-3" aria-hidden />
                      {formatCompact(item.views)}
                    </span>
                    <Button size="sm" onClick={() => onClip(item.url)}>
                      <Scissors className="h-3.5 w-3.5" aria-hidden />
                      Clip this
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-md border border-edge bg-surface px-3.5 py-2.5 text-[11.5px] text-foreground-4">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
        Respect creators&apos; rights: clip what you have permission to use, and keep the credit on.
      </div>
    </div>
  );
}
