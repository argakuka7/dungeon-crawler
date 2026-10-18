// Launches the Blender Lab MCP server (https://projects.blender.org/lab/blender_mcp)
// from a project-local checkout and environment in .pi/blender_mcp/, starting
// Blender with its addon when no running instance serves it.  Never installs
// anything into Blender itself.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, '.pi', 'blender_mcp');
const repository = 'https://projects.blender.org/lab/blender_mcp.git';
const revision = 'dbbf836ad4b1025f14a2b3b504c43903f39e0b04';
const source = join(directory, 'src');
const venv = join(directory, 'venv');
const python = join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const marker = join(directory, '.installed-revision');
const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
const localUv = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv');
const uv = env.BLENDER_MCP_UV || (existsSync(localUv) ? localUv : 'uv');
const host = env.BLENDER_MCP_HOST || 'localhost';

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root, env, encoding: 'utf8',
    // stdout belongs exclusively to the MCP protocol.
    stdio: ['ignore', capture ? 'pipe' : 2, 2],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args[0]} failed: ${result.error?.message || `exit ${result.status}`}`);
  }
  return result.stdout?.trim();
}

function install() {
  if (!existsSync(join(source, '.git'))) {
    mkdirSync(directory, { recursive: true });
    run('git', ['clone', '--quiet', repository, source]);
  }
  if (run('git', ['-C', source, 'rev-parse', 'HEAD'], true) !== revision) {
    const has = spawnSync('git', ['-C', source, 'cat-file', '-e', `${revision}^{commit}`]).status === 0;
    if (!has) run('git', ['-C', source, 'fetch', '--quiet', 'origin']);
    run('git', ['-C', source, 'checkout', '--quiet', '--detach', revision]);
  }
  if (!existsSync(python)) run(uv, ['venv', '--quiet', '--python', '3.12', venv]);
  const installed = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null;
  if (installed !== revision) {
    run(uv, ['pip', 'install', '--quiet', '--python', python, '--reinstall-package', 'blender-mcp', join(source, 'mcp')]);
    writeFileSync(marker, revision);
  }
}

// Resolves to 'ready' when the port runs the Blender Lab addon, 'free' when
// nothing listens, and 'foreign' when another server holds it.  Merely
// accepting a connection is not enough: with a foreign server (e.g. a
// different Blender MCP addon) every tool call would hang.
function probe(port, timeout = 5000) {
  return new Promise(resolve => {
    const socket = createConnection({ host, port });
    let buffer = '';
    let opened = false;
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      opened = true;
      socket.write(JSON.stringify({ type: 'execute', code: 'result = {}', strict_json: true }) + '\0');
    });
    socket.on('data', chunk => {
      buffer += chunk;
      const end = buffer.indexOf('\0');
      if (end < 0) return;
      try {
        finish(JSON.parse(buffer.slice(0, end)).status === 'ok' ? 'ready' : 'foreign');
      } catch {
        finish('foreign');
      }
    });
    socket.once('error', () => finish(opened ? 'foreign' : 'free'));
    socket.once('timeout', () => finish(opened ? 'foreign' : 'free'));
    socket.once('end', () => finish(opened ? 'foreign' : 'free'));
  });
}

// An explicit BLENDER_MCP_PORT is used as is; otherwise reuse the first port in
// a small range that runs the addon, or pick the first free one for a new Blender.
async function choosePort() {
  if (env.BLENDER_MCP_PORT) {
    const port = Number(env.BLENDER_MCP_PORT);
    const state = await probe(port);
    if (state === 'foreign') throw new Error(`Port ${port} is used by another server; choose a different BLENDER_MCP_PORT.`);
    return { port, running: state === 'ready' };
  }
  let free = null;
  for (let port = 9876; port < 9886; port++) {
    const state = await probe(port);
    if (state === 'ready') return { port, running: true };
    if (state === 'free' && free === null) free = port;
    if (state === 'foreign') console.error(`Port ${port} is used by another server; trying the next one.`);
  }
  if (free === null) throw new Error('No free port in 9876-9885; set BLENDER_MCP_PORT.');
  return { port: free, running: false };
}

function findBlender() {
  if (env.BLENDER_PATH) return env.BLENDER_PATH;
  if (process.platform === 'darwin') {
    for (const base of ['/Applications', join(homedir(), 'Applications')]) {
      const candidate = join(base, 'Blender.app', 'Contents', 'MacOS', 'Blender');
      if (existsSync(candidate)) return candidate;
    }
  }
  if (process.platform === 'win32') {
    const base = join(env.ProgramFiles || 'C:/Program Files', 'Blender Foundation');
    if (existsSync(base)) {
      const versions = readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const version of versions) {
        const candidate = join(base, version, 'blender.exe');
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return 'blender';
}

try {
  install();
  // The server's *_for_cli tools run `blender --background` themselves.
  env.BLENDER_PATH = findBlender();

  const { port, running } = await choosePort();
  env.BLENDER_MCP_HOST = host;
  env.BLENDER_MCP_PORT = String(port);
  if (!running) {
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
      throw new Error(`Blender at ${host} is not reachable; start its addon server first.`);
    }
    console.error(`Starting Blender with the project MCP addon on port ${port} (no preferences are changed).`);
    const addon = join(source, 'addon');
    const blender = spawn(env.BLENDER_PATH, ['--online-mode', '--python', join(root, 'tools', 'blender-mcp-start.py'), '--', addon], {
      detached: true, stdio: 'ignore', env,
    });
    await new Promise((resolve, reject) => {
      blender.once('spawn', resolve);
      blender.once('error', reject);
    });
    blender.unref();
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (await probe(port) === 'ready') { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error('Blender did not start its MCP server within 90 seconds. Check the Blender window.');
  }

  const child = spawn(python, ['-m', 'blmcp'], { cwd: root, env, stdio: 'inherit' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
} catch (error) {
  console.error(`Blender MCP: ${error.message}\nInstall git, uv and Blender 5.1+, or set BLENDER_MCP_UV and BLENDER_PATH to their executable paths.`);
  process.exitCode = 1;
}
