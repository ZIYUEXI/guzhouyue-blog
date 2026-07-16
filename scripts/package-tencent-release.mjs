import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const outputRoot = join(repoRoot, 'output');
const packageName = process.env.PACKAGE_NAME || `guzhouyue-blog-tencent-${timestamp()}`;
const stagingRoot = join(outputRoot, packageName);
const zipPath = join(outputRoot, `${packageName}.zip`);

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

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

function copy(source, target) {
  if (!existsSync(source)) {
    return;
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, {
    recursive: true,
    filter: (sourcePath) => {
      const normalized = sourcePath.replace(/\\/g, '/');
      return !normalized.includes('/__pycache__/') &&
        !normalized.endsWith('/__pycache__') &&
        !normalized.endsWith('.pyc') &&
        !normalized.includes('/.pytest_cache/') &&
        !normalized.includes('/.mypy_cache/') &&
        !normalized.includes('/.ruff_cache/');
    },
  });
}

function writeReleaseReadme() {
  writeFileSync(
    join(stagingRoot, 'DEPLOY-TENCENT.md'),
    [
      '# Tencent Cloud Release Package',
      '',
      '## Included',
      '',
      '- `dist/`: frontend build for the admin/full backend deployment.',
      '- `server_py/`: FastAPI backend source.',
      '- `server/requirements.txt`: Python dependencies.',
      '- `server/config.example.json`: config template.',
      '- `package.json` and lockfile: Node build metadata.',
      '- `public/`: static assets and current public snapshot.',
      '- `scripts/`: local helper scripts.',
      '',
      '## Not Included',
      '',
      '- `server/config.json`',
      '- `server/data/*.sqlite`',
      '- `server/uploads/*` runtime uploads',
      '- `.env` secrets',
      '- `node_modules/`',
      '- Python virtualenvs',
      '',
      '## First Deploy',
      '',
      '```bash',
      'cd /opt/guzhouyue-blog',
      'python3 -m venv .venv',
      'source .venv/bin/activate',
      'pip install -r server/requirements.txt',
      'cp server/config.example.json server/config.json',
      'nano server/config.json',
      'NODE_ENV=production python -m server_py.app',
      '```',
      '',
      'For production, run the backend with systemd and expose it through Cloudflare Tunnel as `https://admin.ziyuexi.top`.',
      '',
      '## Required Environment',
      '',
      '```bash',
      'NODE_ENV=production',
      'SERVER_HOST=127.0.0.1',
      'SERVER_PORT=4174',
      'SITE_URL=https://admin.ziyuexi.top',
      'CORS_ORIGINS=https://ziyuexi.top,https://admin.ziyuexi.top',
      'COOKIE_SECURE=true',
      'ADMIN_PASSWORD=replace-with-a-strong-password',
      '```',
      '',
      '## Publish Public Snapshot',
      '',
      'After writing posts, approving comments, or publishing a starfield version:',
      '',
      '```bash',
      'npm run export:public',
      'npm run publish:static',
      '```',
      '',
    ].join('\n'),
    'utf8',
  );
}

console.log('Building full frontend bundle for Tencent backend deployment...');
run('npm', ['run', 'build'], {
  env: {
    VITE_PUBLIC_DATA_SOURCE: process.env.VITE_PUBLIC_DATA_SOURCE || 'api',
  },
});

console.log('Preparing release staging directory...');
rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(stagingRoot, { recursive: true });

copy(join(repoRoot, 'dist'), join(stagingRoot, 'dist'));
copy(join(repoRoot, 'server_py'), join(stagingRoot, 'server_py'));
copy(join(repoRoot, 'server', 'requirements.txt'), join(stagingRoot, 'server', 'requirements.txt'));
copy(join(repoRoot, 'server', 'config.example.json'), join(stagingRoot, 'server', 'config.example.json'));
copy(join(repoRoot, 'server', 'scripts'), join(stagingRoot, 'server', 'scripts'));
copy(join(repoRoot, 'public'), join(stagingRoot, 'public'));
copy(join(repoRoot, 'scripts'), join(stagingRoot, 'scripts'));
copy(join(repoRoot, 'functions'), join(stagingRoot, 'functions'));
copy(join(repoRoot, 'docs', 'cloudflare-tencent-deployment.md'), join(stagingRoot, 'docs', 'cloudflare-tencent-deployment.md'));

for (const file of ['package.json', 'package-lock.json', 'README.md', 'LICENSE']) {
  copy(join(repoRoot, file), join(stagingRoot, file));
}

writeReleaseReadme();

console.log('Creating zip package...');
rmSync(zipPath, { force: true });
run('python', [
  '-c',
  'import pathlib, shutil, sys; shutil.make_archive(str(pathlib.Path(sys.argv[2]).with_suffix("")), "zip", sys.argv[1])',
  stagingRoot,
  zipPath,
]);

if (!existsSync(zipPath)) {
  throw new Error(`Zip package was not created: ${zipPath}`);
}

console.log(`Tencent release package written to ${zipPath}`);
