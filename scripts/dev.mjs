// npm run dev — starts the API and the web app together; Ctrl+C stops both.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const procs = [
  ['api', 'npm run dev', path.join(root, 'backend'), '\x1b[35m'],
  ['web', 'npx expo start --web', path.join(root, 'mobile'), '\x1b[32m'],
].map(([name, cmd, cwd, color]) => {
  const p = spawn(cmd, { cwd, shell: true, env: { ...process.env, FORCE_COLOR: '1' } });
  const tag = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (c) => {
      buf += c.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const l of lines) out.write(tag + l + '\n');
    });
  };
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => {
    console.log(`${tag}stopped (${code ?? 'signal'})`);
    stop();
  });
  return p;
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const p of procs) if (p.exitCode === null) p.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
