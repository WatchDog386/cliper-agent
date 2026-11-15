import { startServer } from './server';

/*
 * One API process. The heavy lifting (downloading and rendering video) happens in child processes
 * (yt-dlp and ffmpeg) started by the job queue, so a single Node process is enough; CLIP_CONCURRENCY
 * controls how many jobs render at once.
 */
startServer();
