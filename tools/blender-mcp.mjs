// Project-local MCP environment; never install Python packages into Blender itself.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, '.pi', 'blender-mcp');
const version = '2.1.9';
const python = join(directory, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const marker = join(directory, '.installed-version');
const env = { ...process.env, DISABLE_TELEMETRY: 'true', PYTHONIOENCODING: 'utf-8' };
const localUv = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv');
const uv = process.env.BLENDER_MCP_UV || (existsSync(localUv) ? localUv : 'uv');

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root, env, encoding: 'utf8',
    // stdout belongs exclusively to the MCP protocol.
    stdio: ['ignore', capture ? 'pipe' : 2, 2],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || `exit ${result.status}`}`);
  }
  return result.stdout?.trim();
}

// Resolves to 'ready' when the port speaks this addon's protocol, 'free' when
// nothing listens, and 'foreign' when another server (e.g. a different Blender
// MCP addon) holds it.  Merely accepting a connection is not enough: a foreign
// server would leave every tool call hanging.
function probe(port, timeout = 3000) {
  return new Promise(resolve => {
    const socket = createConnection({ host: env.BLENDER_HOST || 'localhost', port });
    let buffer = '';
    let opened = false;
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      opened = true;
      socket.write(JSON.stringify({ type: 'get_addon_info', params: {} }));
    });
    socket.on('data', chunk => {
      buffer += chunk;
      try {
        const response = JSON.parse(buffer);
        finish(response?.result?.protocol_version != null ? 'ready' : 'foreign');
      } catch { /* incomplete, wait for more */ }
    });
    socket.once('error', () => finish(opened ? 'foreign' : 'free'));
    socket.once('timeout', () => finish(opened ? 'foreign' : 'free'));
    socket.once('end', () => finish(opened ? 'foreign' : 'free'));
  });
}

// An explicit BLENDER_PORT is used as is; otherwise reuse the first port in a
// small range that runs this addon, or pick the first free one for a new Blender.
async function choosePort() {
  if (env.BLENDER_PORT) {
    const port = Number(env.BLENDER_PORT);
    const state = await probe(port);
    if (state === 'foreign') throw new Error(`Port ${port} is used by another server; choose a different BLENDER_PORT.`);
    return { port, running: state === 'ready' };
  }
  let free = null;
  for (let port = 9876; port < 9886; port++) {
    const state = await probe(port);
    if (state === 'ready') return { port, running: true };
    if (state === 'free' && free === null) free = port;
    if (state === 'foreign') console.error(`Port ${port} is used by another server; trying the next one.`);
  }
  if (free === null) throw new Error('No free port in 9876-9885; set BLENDER_PORT.');
  return { port: free, running: false };
}

function findBlender() {
  if (env.BLENDER_EXECUTABLE) return env.BLENDER_EXECUTABLE;
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
  const installed = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null;
  if (!existsSync(python)) {
    mkdirSync(dirname(directory), { recursive: true });
    run(uv, ['venv', '--python', '3.11', directory]);
  }
  if (installed !== version) {
    run(uv, ['pip', 'install', '--python', python, `mcp-for-blender==${version}`]);
    writeFileSync(marker, version);
  }

  const { port, running } = await choosePort();
  env.BLENDER_PORT = String(port);
  if (!running) {
    if (env.BLENDER_HOST && !['localhost', '127.0.0.1', '::1'].includes(env.BLENDER_HOST)) {
      throw new Error('Remote Blender is not reachable; start its addon server first.');
    }
    const addon = run(python, ['-c', 'from blender_mcp.addon_manager import get_bundled_addon_path; print(get_bundled_addon_path())'], true);
    console.error('Starting Blender with the project MCP addon (no preferences are changed).');
    const blender = spawn(findBlender(), ['--python', join(root, 'tools', 'blender-mcp-start.py'), '--', addon], {
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

  const child = spawn(python, ['-m', 'blender_mcp.server'], { cwd: root, env, stdio: 'inherit' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
} catch (error) {
  console.error(`Blender MCP: ${error.message}\nInstall uv and Blender, or set BLENDER_MCP_UV and BLENDER_EXECUTABLE to their executable paths.`);
  process.exitCode = 1;
}
