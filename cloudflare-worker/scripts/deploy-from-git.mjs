import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim());
  return result.stdout.trim();
}
const status = git('status', '--porcelain');
if (status) throw new Error('Refusing Worker deploy: worktree is not clean. Commit the reviewed changes first.');
const head = git('rev-parse', 'HEAD');
const originMain = git('rev-parse', 'origin/main');
if (head !== originMain) throw new Error(`Refusing Worker deploy: HEAD ${head} is not origin/main ${originMain}.`);
const wrangler = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(wrangler, ['--yes', 'wrangler', 'deploy', '--var', `WORKER_BUILD:${head}`], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
