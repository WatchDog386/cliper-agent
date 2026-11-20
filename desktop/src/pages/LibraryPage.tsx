import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Film,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Scissors,
  Search,
  Trash2,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import type { Job, JobStats } from '@/lib/types';
import { mediaUrl } from '@/lib/api';
import { cn, formatBytes, formatClock, timeAgo } from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  ProgressBar,
  Segmented,
  Spinner,
  StatCard,
  statusLabel,
  statusVariant,
} from '@/components/ui';

type Filter = 'all' | 'active' | 'done' | 'failed';

export function LibraryPage({
  jobs,
  stats,
  loading,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onRefresh,
  onNew,
  onRedo,
  onDelete,
  onRetry,
  onCancel,
}: {
  jobs: Job[];
  stats: JobStats | null;
  loading: boolean;
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  onRefresh: () => void;
  onNew: () => void;
  onRedo: (job: Job) => void;
  onDelete: (job: Job) => void;
  onRetry: (job: Job) => void;
  onCancel: (job: Job) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return jobs;
    return jobs.filter((job) =>
      [job.title, job.uploader, job.sourceUrl, job.sourceName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [jobs, search]);

  return (
    <div className="page-enter">
      <PageHeader
        title="My clips"
        description="Every job you have started, newest first."
        actions={
          <>
            <Button variant="outline" onClick={onRefresh} loading={loading}>
              <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Refresh
            </Button>
            <Button onClick={onNew}>
              <Scissors className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              New job
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-4 gap-4">
        <StatCard
          tone="green"
          icon={Film}
          value={String(stats?.total ?? jobs.length)}
          label="Total jobs"
          note="All time"
          onClick={() => onFilterChange('all')}
        />
        <StatCard
          tone="blue"
          icon={Loader2}
          value={String(stats?.active ?? jobs.filter((job) => isActive(job)).length)}
          label="In progress"
          note="Queued, fetching, rendering"
          onClick={() => onFilterChange('active')}
        />
        <StatCard
          tone="yellow"
          icon={CheckCircle2}
          value={String(stats?.done ?? jobs.filter((job) => job.status === 'DONE').length)}
          label="Ready to post"
          note="Finished jobs"
          onClick={() => onFilterChange('done')}
        />
        <StatCard
          tone="red"
          icon={Scissors}
          value={String(stats?.clips ?? jobs.reduce((total, job) => total + job.clipCount, 0))}
          label="Clips made"
          note="Across all jobs"
          onClick={() => onFilterChange('all')}
        />
      </div>

      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Segmented
          value={filter}
          onChange={onFilterChange}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'done', label: 'Ready' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
        <div className="relative w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-5"
            strokeWidth={1.75}
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search jobs by title, creator or link"
            className="pl-9"
            aria-label="Search jobs"
          />
        </div>
      </Card>

      {visible.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={search ? 'No matching jobs' : 'No jobs yet'}
          description={
            search
              ? 'Try a different title, creator or link.'
              : 'Paste a video link or upload a file to make your first clips.'
          }
          actionLabel={search ? undefined : 'Create first job'}
          onAction={onNew}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              open={openId === job.id}
              onToggle={() => setOpenId((id) => (id === job.id ? null : job.id))}
              onRedo={() => onRedo(job)}
              onDelete={() => onDelete(job)}
              onRetry={() => onRetry(job)}
              onCancel={() => onCancel(job)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function isActive(job: Job): boolean {
  return ['QUEUED', 'FETCHING', 'ANALYZING', 'RENDERING'].includes(job.status);
}

function JobCard({
  job,
  open,
  onToggle,
  onRedo,
  onDelete,
  onRetry,
  onCancel,
}: {
  job: Job;
  open: boolean;
  onToggle: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const active = isActive(job);
  const cover = job.cover ?? job.thumbnailUrl;

  return (
    <Card className={cn('overflow-hidden transition-shadow', open && 'shadow-lift')}>
      <div className="flex items-center gap-3 p-3.5">
        <button
          type="button"
          onClick={onToggle}
          className="relative flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-3"
          aria-label={open ? 'Hide clips' : 'Show clips'}
        >
          {cover ? (
            <img src={mediaUrl(cover)} alt="" className="h-full w-full object-cover" />
          ) : (
            <Film className="h-5 w-5 text-foreground-5" aria-hidden />
          )}
          {job.status === 'DONE' && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity hover:opacity-100">
              <Play className="h-5 w-5 text-white" fill="currentColor" aria-hidden />
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              className="truncate text-left text-[13.5px] font-medium text-foreground hover:text-accent-text"
            >
              {job.title}
            </button>
            <Badge variant={statusVariant(job.status)}>{statusLabel(job.status)}</Badge>
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-foreground-4">
            {[job.uploader, job.sourceKind === 'UPLOAD' ? job.sourceName : job.sourceUrl, timeAgo(job.createdAt)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {active && (
            <div className="mt-1.5 flex items-center gap-2">
              <ProgressBar value={job.progress} className="max-w-[240px]" />
              <span className="shrink-0 text-[11px] tabular-nums text-foreground-4">
                {job.progress}% {job.stage ? `· ${job.stage}` : ''}
              </span>
            </div>
          )}
          {job.status === 'FAILED' && job.error && (
            <p className="mt-1 line-clamp-1 text-[11.5px] text-danger">{job.error}</p>
          )}
        </div>

        <div className="hidden shrink-0 text-right text-[11.5px] text-foreground-4 md:block">
          <p className="tabular-nums">{job.clipCount} clip{job.clipCount === 1 ? '' : 's'}</p>
          <p className="tabular-nums">{job.totalBytes ? formatBytes(job.totalBytes) : '—'}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {job.status === 'DONE' && (
            <Button variant="outline" size="sm" onClick={onToggle}>
              <FolderOpen className="h-3.5 w-3.5" aria-hidden />
              {open ? 'Hide' : 'Clips'}
            </Button>
          )}
          {active && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <XCircle className="h-3.5 w-3.5" aria-hidden />
              Cancel
            </Button>
          )}
          {(job.status === 'FAILED' || job.status === 'CANCELLED') && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Retry
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onRedo}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Re-clip
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="Delete job"
            className="text-foreground-4 hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-edge bg-surface-2/60 p-3.5">
          {job.status !== 'DONE' ? (
            <div className="flex items-center gap-2 py-6 text-[12.5px] text-foreground-4">
              {active ? <Spinner className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" aria-hidden />}
              {active
                ? `Clips are not ready yet. ${job.stage ?? 'Working…'}`
                : job.error ?? 'This job did not finish.'}
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-medium text-foreground-2">
                  {job.clips.length} clip{job.clips.length === 1 ? '' : 's'} ·{' '}
                  <span className="font-normal text-foreground-4">
                    {formatClock(job.sourceDuration)} source
                  </span>
                </p>
                <a href={mediaUrl(job.zipUrl)} download>
                  <Button variant="secondary" size="sm">
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    Download all (.zip)
                  </Button>
                </a>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {job.clips.map((clip) => (
                  <div
                    key={clip.id}
                    className="group overflow-hidden rounded-md border border-edge bg-surface"
                  >
                    <div className="relative aspect-video bg-black">
                      {clip.thumbUrl ? (
                        <img src={mediaUrl(clip.thumbUrl)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <video
                          src={mediaUrl(clip.videoUrl)}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      )}
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                        {formatClock(clip.duration)}
                      </span>
                      <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        #{clip.index}
                      </span>
                    </div>
                    <div className="p-2">
                      <p className="truncate text-[12px] font-medium text-foreground">
                        {clip.title ?? `Clip ${clip.index}`}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="truncate text-[10.5px] text-foreground-4">
                          {formatClock(clip.startSec)} – {formatClock(clip.endSec)} · {formatBytes(clip.sizeBytes)}
                        </span>
                        <a
                          href={mediaUrl(clip.downloadUrl)}
                          download
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-foreground-4 transition-colors hover:bg-accent-soft hover:text-accent"
                          aria-label={`Download clip ${clip.index}`}
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
