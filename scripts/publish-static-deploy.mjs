import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const deployRepo = process.env.DEPLOY_REPO || 'https://github.com/ZIYUEXI/guzhouyue-blog-deploy.git';
const deployBranch = process.env.DEPLOY_BRANCH || 'main';
const adminOrigin = process.env.VITE_ADMIN_ORIGIN || 'https://admin.ziyuexi.top';
const commitMessage = process.env.DEPLOY_COMMIT_MESSAGE || `Update public snapshot ${new Date().toISOString()}`;
const workRoot = join(tmpdir(), 'guzhouyue-blog-deploy-worktree');
const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

function run(command, args, options = {}) {
  const useShell = process.platform === 'win32' && command === 'npm';
  const result = spawnSync(useShell ? command : resolveCommand(command), args, {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: useShell,
  });

  if (result.status !== 0) {
    const details = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(`${command} ${args.join(' ')} failed${details ? `\n${details}` : ''}`);
  }

  return result.stdout?.trim() || '';
}

function resolveCommand(command) {
  if (process.platform !== 'win32') {
    return command;
  }
  if (command === 'npm') {
    return 'npm.cmd';
  }
  return command;
}

function copyIntoDeployRepo(source, target) {
  rmSync(target, { recursive: true, force: true });
  if (existsSync(source)) {
    cpSync(source, target, { recursive: true });
  }
}

function copyDirectoryContents(source, target) {
  if (!existsSync(source)) {
    return;
  }

  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    cpSync(join(source, entry), join(target, entry), { recursive: true });
  }
}

function cleanDeployRepo(targetRoot) {
  for (const entry of readdirSync(targetRoot, { withFileTypes: true })) {
    if (entry.name === '.git') {
      continue;
    }
    rmSync(join(targetRoot, entry.name), { recursive: true, force: true });
  }
}

function ensureGitIdentity(cwd) {
  const name = run('git', ['config', '--get', 'user.name'], { cwd, capture: true });
  if (!name) {
    run('git', ['config', 'user.name', 'Guzhouyue Deploy Bot'], { cwd });
  }

  const email = run('git', ['config', '--get', 'user.email'], { cwd, capture: true });
  if (!email) {
    run('git', ['config', 'user.email', 'deploy@guzhouyue.local'], { cwd });
  }
}

function writeCloudflareBuildShim() {
  mkdirSync(join(workRoot, 'scripts'), { recursive: true });
  writeFileSync(
    join(workRoot, 'package.json'),
    `${JSON.stringify(
      {
        private: true,
        type: 'module',
        scripts: {
          build: 'node scripts/cloudflare-pages-build.mjs',
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  writeFileSync(
    join(workRoot, 'scripts', 'cloudflare-pages-build.mjs'),
    [
      "import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';",
      "import { join } from 'node:path';",
      '',
      'const root = process.cwd();',
      "const output = join(root, 'dist');",
      "const excluded = new Set(['.git', 'dist', 'functions', 'node_modules', 'package.json', 'package-lock.json', 'scripts']);",
      '',
      'rmSync(output, { recursive: true, force: true });',
      'mkdirSync(output, { recursive: true });',
      '',
      'for (const entry of readdirSync(root, { withFileTypes: true })) {',
      '  if (excluded.has(entry.name)) {',
      '    continue;',
      '  }',
      '  cpSync(join(root, entry.name), join(output, entry.name), { recursive: true });',
      '}',
      '',
      "console.log('Prepared prebuilt static files in dist/ for Cloudflare Pages.');",
      '',
    ].join('\n'),
    'utf8',
  );
}

console.log('Exporting public snapshot...');
run('npm', ['run', 'export:public']);

console.log('Building Cloudflare Pages static frontend...');
run('npm', ['run', 'build'], {
  env: {
    VITE_PUBLIC_DATA_SOURCE: 'static',
    VITE_ADMIN_ORIGIN: adminOrigin,
  },
});

console.log(`Preparing deploy repository: ${deployRepo}`);
rmSync(workRoot, { recursive: true, force: true });
mkdirSync(workRoot, { recursive: true });
run('git', ['clone', '--branch', deployBranch, '--single-branch', deployRepo, workRoot]);

cleanDeployRepo(workRoot);
copyDirectoryContents(join(repoRoot, 'dist'), workRoot);
copyIntoDeployRepo(join(repoRoot, 'functions'), join(workRoot, 'functions'));
writeCloudflareBuildShim();
writeFileSync(
  join(workRoot, 'README.md'),
  [
    '# Guzhouyue Blog Public Deploy',
    '',
    'This repository is generated from `ZIYUEXI/guzhouyue-blog`.',
    '',
    '- Public frontend is built in static snapshot mode.',
    '- Cloudflare Pages should deploy this repository root.',
    '- `/api/health` and comment submission are proxied by Pages Functions.',
    '',
  ].join('\n'),
  'utf8',
);

ensureGitIdentity(workRoot);
run('git', ['add', '--all'], { cwd: workRoot });
const hasChanges = run('git', ['status', '--short'], { cwd: workRoot, capture: true });
if (!hasChanges) {
  console.log('Deploy repository has no changes to publish.');
  process.exit(0);
}

if (dryRun) {
  console.log('Dry run complete. Deploy repository has changes, but commit and push were skipped.');
  console.log(`Prepared worktree: ${workRoot}`);
  process.exit(0);
}

run('git', ['commit', '-m', commitMessage], { cwd: workRoot });
run('git', ['push', 'origin', deployBranch], { cwd: workRoot });

const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: workRoot, encoding: 'utf8' }).trim();
console.log(`Published static deploy ${head} to ${deployRepo} (${deployBranch}).`);
