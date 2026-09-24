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
const branch = git('symbolic-ref', '--short', 'HEAD');
const approvedBranches = String(process.env.WORKER_RELEASE_BRANCHES || 'main').split(',').map(value => value.trim()).filter(Boolean);
if (!approvedBranches.includes(branch)) throw new Error(`Refusing Worker deploy: branch ${branch} is not approved (${approvedBranches.join(', ')}).`);
const head = git('rev-parse', 'HEAD');
if (!/^[0-9a-f]{40}$/i.test(head)) throw new Error(`Refusing Worker deploy: build hash is not a full commit SHA (${head}).`);
const originMain = git('rev-parse', 'origin/main');
const containsOriginMain = spawnSync('git', ['merge-base', '--is-ancestor', originMain, head], { cwd: root, encoding: 'utf8' });
if (containsOriginMain.status !== 0) throw new Error(`Refusing Worker deploy: origin/main ${originMain} is newer than HEAD ${head}.`);
const wrangler = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(wrangler, ['--yes', 'wrangler', 'deploy', '--var', `WORKER_BUILD:${head}`], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
