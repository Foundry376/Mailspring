import fs from 'fs';
import path from 'path';
import os from 'os';
import { FsUtils } from 'mailspring-exports';

// Claude Desktop only speaks stdio to MCP servers listed in its config file
// (a `url` entry is not supported and is discarded on launch), so Mailspring
// registers a stdio bridge that proxies to its HTTP server. The bridge runs
// under Mailspring's own Electron binary as Node (ELECTRON_RUN_AS_NODE), so
// the setup works without any Node.js on the machine and never depends on
// Claude Desktop's PATH — the failure behind
// https://community.getmailspring.com/t/mcp-claude-desktop-not-working/14528.
//
// This requires Electron's `runAsNode` fuse to stay enabled in the packaged
// app (it is on by default; no fuses are configured in build.js). Disabling
// it would silently break every existing Claude Desktop registration.

const ENTRY_NAME = 'mailspring';

interface McpServerEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface ClaudeDesktopConfig {
  mcpServers?: Record<string, Partial<McpServerEntry> | undefined>;
  [key: string]: unknown;
}

export function claudeDesktopConfigPath(): string {
  let configDir: string;
  if (process.platform === 'win32') {
    if (!process.env.APPDATA) throw new Error('APPDATA is not set');
    configDir = path.join(process.env.APPDATA, 'Claude');
  } else if (process.platform === 'darwin') {
    configDir = path.join(os.homedir(), 'Library', 'Application Support', 'Claude');
  } else {
    configDir = path.join(
      process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
      'Claude'
    );
  }
  return path.join(configDir, 'claude_desktop_config.json');
}

function bridgeScriptPath(): string {
  // The bridge is listed in the asar unpack globs (build.js) so that it exists
  // as a real file Node can execute directly.
  return path.join(__dirname, 'mcp-stdio-bridge.js').replace('app.asar', 'app.asar.unpacked');
}

function electronApp(): Electron.App {
  return require('@electron/remote').app;
}

export function mailspringClaudeDesktopEntry(): McpServerEntry {
  return {
    // `process.execPath` in a renderer is the Helper binary, so ask the main
    // process for the app executable instead.
    command: electronApp().getPath('exe'),
    args: [bridgeScriptPath(), '--config-dir', AppEnv.getConfigDirPath()],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}

// Reads Claude Desktop's config, resolving symlinks so a later write replaces
// the real file rather than the link. Returns an empty config only when the
// file is absent; a file that exists but doesn't parse is an error, because
// silently rebuilding it would drop the user's other MCP servers.
function readConfig(): { configPath: string; config: ClaudeDesktopConfig } {
  let configPath = claudeDesktopConfigPath();
  if (!fs.existsSync(configPath)) {
    return { configPath, config: {} };
  }
  configPath = fs.realpathSync(configPath);
  const raw = fs.readFileSync(configPath, 'utf8');
  if (raw.trim() === '') {
    return { configPath, config: {} };
  }
  try {
    return { configPath, config: JSON.parse(raw) };
  } catch (err) {
    throw new Error(`${configPath} is not valid JSON (${(err as Error).message})`);
  }
}

function writeConfig(configPath: string, config: ClaudeDesktopConfig) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  FsUtils.atomicWriteFileSync(configPath, JSON.stringify(config, null, 2));
}

export function writeMailspringClaudeDesktopEntry() {
  const { configPath, config } = readConfig();
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers[ENTRY_NAME] = mailspringClaudeDesktopEntry();
  writeConfig(configPath, config);
}

// The bridge form above, or the earlier form that ran `npx mcp-remote@latest`.
function isMailspringEntry(entry: Partial<McpServerEntry>): boolean {
  if (entry.env?.ELECTRON_RUN_AS_NODE) return true;
  return entry.command === 'npx' && (entry.args || []).includes('mcp-remote@latest');
}

function pointsAtMissingFiles(entry: Partial<McpServerEntry>): boolean {
  return !fs.existsSync(entry.command || '') || !fs.existsSync(entry.args?.[0] || '');
}

// The registered entry embeds absolute paths that go stale when the app is
// moved, and on Windows after every Squirrel update (each version installs
// into its own app-x.y.z directory). Called at startup: rewrites the entry
// only when Mailspring wrote it and it no longer points at existing files,
// which also migrates the npx form. Skipped for copies that aren't a real
// install (dev mode, or macOS builds run from Downloads or a mounted DMG) so
// a registration pointing at /Applications is never repointed at a path that
// disappears.
export function refreshMailspringClaudeDesktopEntryIfStale() {
  if (AppEnv.inDevMode()) return;
  if (process.platform === 'darwin' && !electronApp().isInApplicationsFolder()) return;

  const { configPath, config } = readConfig();
  const existing = config.mcpServers?.[ENTRY_NAME];
  if (!existing || !isMailspringEntry(existing)) return;
  if (existing.env?.ELECTRON_RUN_AS_NODE && !pointsAtMissingFiles(existing)) return;

  config.mcpServers[ENTRY_NAME] = mailspringClaudeDesktopEntry();
  writeConfig(configPath, config);
}
