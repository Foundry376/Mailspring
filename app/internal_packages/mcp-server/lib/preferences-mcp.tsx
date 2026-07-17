import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import React from 'react';
import { localized } from 'mailspring-exports';
import { Switch, RetinaImg } from 'mailspring-component-kit';
import McpServerManager from './mcp-server-manager';
import PreferencesMcpAccounts from './preferences-mcp-accounts';
import PreferencesMcpAudit from './preferences-mcp-audit';

const execFileAsync = promisify(execFile);
const CLAUDE_CODE_MCP_NAME = 'mailspring-mcp';

interface State {
  enabled: boolean;
  port: number;
  accessLevel: string;
  token: string;
  enabledAccounts: { [accountId: string]: { enabled: boolean; excludedFolderIds?: string[] } };
  running: boolean;
  error: string | null;
  tokenCopied: boolean;
  claudeStatus: string | null;
  codexStatus: string | null;
  claudeCodeStatus: string | null;
  // Set true once the user has successfully added Mailspring to any AI tool;
  // reveals the "Try It!" example prompt beneath the Quick Setup buttons.
  tryItVisible: boolean;
  tryItCopied: boolean;
}

export default class PreferencesMcp extends React.Component<Record<string, never>, State> {
  _unsub: (() => void) | null = null;
  // Debounce timer for committing the port input to config — see
  // _onPortChange for why this is timer-based rather than blur-based.
  _portChangeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Record<string, never>) {
    super(props);
    // tryItVisible/tryItCopied are UI-only and must persist across the
    // manager-driven setState(this._getState()) updates, so they live outside
    // _getState() and are seeded here.
    this.state = { ...this._getState(), tryItVisible: false, tryItCopied: false };
  }

  componentDidMount() {
    this._unsub = McpServerManager.listen(() => {
      this.setState(this._getState());
    });
  }

  componentWillUnmount() {
    this._unsub?.();
    if (this._portChangeTimer) {
      clearTimeout(this._portChangeTimer);
      this._portChangeTimer = null;
    }
  }

  _getState(): Omit<State, 'tryItVisible' | 'tryItCopied'> {
    return {
      enabled: AppEnv.config.get('core.mcp.enabled') || false,
      port: AppEnv.config.get('core.mcp.port') || 2587,
      accessLevel: AppEnv.config.get('core.mcp.accessLevel') || 'read-only',
      token: McpServerManager.getToken(),
      enabledAccounts: AppEnv.config.get('core.mcp.enabledAccounts') || {},
      running: McpServerManager.isRunning(),
      error: McpServerManager.getError(),
      tokenCopied: false,
      claudeStatus: null,
      codexStatus: null,
      claudeCodeStatus: null,
    };
  }

  _tryItPrompt() {
    return localized(
      'Read the threads in my inbox using Mailspring - what should I prioritize? Draft a reply to the most important message.'
    );
  }

  _onCopyTryIt = () => {
    navigator.clipboard.writeText(this._tryItPrompt());
    this.setState({ tryItCopied: true });
    setTimeout(() => this.setState({ tryItCopied: false }), 2000);
  };

  // Renders one Quick Setup button. Short status messages ("Adding…",
  // "Added!") display inside the fixed-width button in place of its label;
  // long error messages are surfaced separately below the button row.
  _renderQuickSetupButton(label: string, status: string | null, onClick: () => void) {
    const isError = !!status && status.startsWith('Error');
    return (
      <button className="btn mcp-quick-setup-btn" onClick={onClick}>
        {status && !isError ? status : label}
      </button>
    );
  }

  _onToggleEnabled = () => {
    AppEnv.config.set('core.mcp.enabled', !this.state.enabled);
    this.setState(this._getState());
  };

  _onPortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const port = parseInt(e.target.value, 10);
    if (port > 0 && port < 65536) {
      // Update local state immediately so the input stays responsive, but
      // debounce the actual config write (~500ms after the user stops
      // typing/spinning the input). This field is a number input, which is
      // often adjusted via the spinner arrows rather than typed, so a
      // timer-based debounce is more reliable here than commit-on-blur.
      // Writing to config on every keystroke would otherwise trigger a
      // full MCP server restart per keystroke.
      this.setState({ port });
      if (this._portChangeTimer) clearTimeout(this._portChangeTimer);
      this._portChangeTimer = setTimeout(() => {
        this._portChangeTimer = null;
        AppEnv.config.set('core.mcp.port', port);
      }, 500);
    }
  };

  _onAccessLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    AppEnv.config.set('core.mcp.accessLevel', e.target.value);
    this.setState({ accessLevel: e.target.value });
  };

  _onCopyToken = () => {
    navigator.clipboard.writeText(this.state.token);
    this.setState({ tokenCopied: true });
    setTimeout(() => this.setState({ tokenCopied: false }), 2000);
  };

  _onRegenerateToken = () => {
    McpServerManager.regenerateToken();
    this.setState(this._getState());
  };

  _onAccountsChange = (enabledAccounts: State['enabledAccounts']) => {
    AppEnv.config.set('core.mcp.enabledAccounts', enabledAccounts);
    this.setState({ enabledAccounts });
  };

  _onAddToClaudeDesktop = () => {
    try {
      const configDir =
        process.platform === 'win32'
          ? path.join(process.env.APPDATA || '', 'Claude')
          : path.join(os.homedir(), 'Library', 'Application Support', 'Claude');
      const configPath = path.join(configDir, 'claude_desktop_config.json');

      let config: { mcpServers?: Record<string, unknown> } = {};
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch {
        // File doesn't exist or is invalid — start fresh
      }

      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers.mailspring = {
        command: 'npx',
        args: [
          'mcp-remote@latest',
          `http://127.0.0.1:${this.state.port}/mcp`,
          '--allow-http',
          '--transport',
          'http-only',
          '--header',
          `Authorization: Bearer ${this.state.token}`,
        ],
      };

      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

      this.setState({ claudeStatus: localized('Added!'), tryItVisible: true });
      setTimeout(() => this.setState({ claudeStatus: null }), 3000);
    } catch (err) {
      this.setState({ claudeStatus: `Error: ${(err as Error).message}` });
      setTimeout(() => this.setState({ claudeStatus: null }), 5000);
    }
  };

  _onAddToChatGPT = () => {
    try {
      const configDir =
        process.platform === 'win32'
          ? path.join(process.env.USERPROFILE || os.homedir(), '.codex')
          : path.join(os.homedir(), '.codex');
      const configPath = path.join(configDir, 'config.toml');

      let content = '';
      try {
        content = fs.readFileSync(configPath, 'utf8');
      } catch {
        // File doesn't exist — start fresh
      }

      const block = [
        `[mcp_servers.mailspring]`,
        `url = "http://127.0.0.1:${this.state.port}/mcp"`,
        `http_headers = { "Authorization" = "Bearer ${this.state.token}" }`,
      ].join('\n');

      // Replace existing mailspring block or append
      // eslint-disable-next-line no-useless-escape
      const sectionRe = /\[mcp_servers\.mailspring\][^\[]*/s;
      if (sectionRe.test(content)) {
        content = content.replace(sectionRe, block + '\n\n');
      } else {
        content = content.trimEnd() + (content.trim() ? '\n\n' : '') + block + '\n';
      }

      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configPath, content, 'utf8');

      this.setState({ codexStatus: localized('Added!'), tryItVisible: true });
      setTimeout(() => this.setState({ codexStatus: null }), 3000);
    } catch (err) {
      this.setState({ codexStatus: `Error: ${(err as Error).message}` });
      setTimeout(() => this.setState({ codexStatus: null }), 5000);
    }
  };

  // Resolves the `claude` CLI binary's absolute path, if installed. GUI apps
  // on macOS/Linux inherit a minimal PATH that often excludes nvm/Homebrew
  // install locations, so we resolve it through the user's login shell
  // (which sources their shell profile) rather than trusting our own PATH.
  async _findClaudeBinary(): Promise<string | null> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('where', ['claude']);
        return stdout.split(/\r?\n/)[0].trim() || null;
      }
      const shell = process.env.SHELL || '/bin/zsh';
      const { stdout } = await execFileAsync(shell, ['-lic', 'command -v claude']);
      // A login/interactive shell sources the user's profile, which can print
      // banners to stdout around our command's output (e.g. macOS Terminal's
      // "Restored session: <date>" line). So don't trust the whole blob —
      // scan the lines for the last one that's an actual absolute path to an
      // existing file, which is the `command -v claude` result.
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].startsWith('/') && fs.existsSync(lines[i])) return lines[i];
      }
      return null;
    } catch {
      return null;
    }
  }

  _onAddToClaudeCode = async () => {
    this.setState({ claudeCodeStatus: localized('Adding…') });
    try {
      const claudeBin = await this._findClaudeBinary();
      if (!claudeBin) {
        this.setState({
          claudeCodeStatus:
            'Error: Claude Code CLI not found on your PATH. Install it, then try again.',
        });
        setTimeout(() => this.setState({ claudeCodeStatus: null }), 6000);
        return;
      }

      const url = `http://127.0.0.1:${this.state.port}/mcp`;
      const header = `Authorization: Bearer ${this.state.token}`;

      // `claude mcp add` doesn't overwrite an existing entry of the same
      // name, so remove any prior registration first (ignoring errors if
      // none exists) — this keeps the button safe to re-run after the port
      // or token changes.
      await execFileAsync(claudeBin, [
        'mcp',
        'remove',
        CLAUDE_CODE_MCP_NAME,
        '--scope',
        'user',
      ]).catch(() => {});

      await execFileAsync(claudeBin, [
        'mcp',
        'add',
        CLAUDE_CODE_MCP_NAME,
        '--scope',
        'user',
        '--transport',
        'http',
        url,
        '--header',
        header,
      ]);

      this.setState({ claudeCodeStatus: localized('Added!'), tryItVisible: true });
      setTimeout(() => this.setState({ claudeCodeStatus: null }), 3000);
    } catch (err) {
      this.setState({ claudeCodeStatus: `Error: ${(err as Error).message}` });
      setTimeout(() => this.setState({ claudeCodeStatus: null }), 5000);
    }
  };

  render() {
    const {
      enabled,
      port,
      accessLevel,
      token,
      running,
      error,
      tokenCopied,
      enabledAccounts,
      claudeStatus,
      codexStatus,
      claudeCodeStatus,
      tryItVisible,
      tryItCopied,
    } = this.state;

    const setupError = [claudeStatus, codexStatus, claudeCodeStatus].find(
      (s) => s && s.startsWith('Error')
    );

    return (
      <div className="container-mcp">
        <section>
          <h6>{localized('MCP Server')}</h6>
          <p className="mcp-description">
            {localized(
              'The MCP server lets AI assistants (like Claude Desktop) read and interact with your email.'
            )}
          </p>
          <div className="mcp-toggle-row">
            <Switch
              checked={enabled}
              onChange={this._onToggleEnabled}
              label={localized('Enable MCP Server')}
            />
            <span className="mcp-toggle-label">{localized('Enable MCP Server')}</span>
            {enabled && (
              <span className={`mcp-status ${running ? 'running' : 'stopped'}`}>
                {running ? localized('Running') : localized('Stopped')}
              </span>
            )}
          </div>
          {error && <div className="mcp-error">{error}</div>}
        </section>

        {enabled && (
          <>
            <div className="mcp-columns">
              <div className="mcp-column">
                <section>
                  <h6>{localized('Quick Setup')}</h6>
                  <p className="mcp-description">
                    {localized(
                      "Add Mailspring to your AI tools with one click. This writes the connection details to each tool's config file."
                    )}
                  </p>
                  <div className="mcp-quick-setup">
                    {this._renderQuickSetupButton(
                      localized('Add to Claude Desktop'),
                      claudeStatus,
                      this._onAddToClaudeDesktop
                    )}
                    {this._renderQuickSetupButton(
                      localized('Add to ChatGPT Desktop'),
                      codexStatus,
                      this._onAddToChatGPT
                    )}
                    {this._renderQuickSetupButton(
                      localized('Add to Claude Code'),
                      claudeCodeStatus,
                      this._onAddToClaudeCode
                    )}
                  </div>
                  {setupError && <div className="mcp-error">{setupError}</div>}
                  {tryItVisible && (
                    <div className="mcp-try-it">
                      <h6>{localized('Try It!')}</h6>
                      <div className="mcp-try-it-prompt">
                        <code>{this._tryItPrompt()}</code>
                        <button
                          className="btn btn-small btn-icon"
                          onClick={this._onCopyTryIt}
                          title={localized('Copy to clipboard')}
                        >
                          {tryItCopied ? (
                            localized('Copied!')
                          ) : (
                            <RetinaImg
                              name="icon-copytoclipboard.png"
                              mode={RetinaImg.Mode.ContentIsMask}
                            />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </div>

              <div className="mcp-column">
                <section>
                  <h6>{localized('Connection')}</h6>
                  <div className="mcp-field-row">
                    <label>{localized('Port')}</label>
                    <input
                      type="number"
                      value={port}
                      onChange={this._onPortChange}
                      min={1}
                      max={65535}
                      className="mcp-port-input"
                    />
                  </div>
                  <div className="mcp-field-row">
                    <label>{localized('Access Level')}</label>
                    <select value={accessLevel} onChange={this._onAccessLevelChange}>
                      <option value="read-only">{localized('Read Only')}</option>
                      <option value="read-write">{localized('Read & Write')}</option>
                      <option value="read-write-send">{localized('Read, Write & Send')}</option>
                    </select>
                  </div>
                  <div className="mcp-field-row">
                    <label>{localized('Endpoint')}</label>
                    <code className="mcp-endpoint">http://127.0.0.1:{port}/mcp</code>
                  </div>
                  <div className="mcp-field-row">
                    <label>{localized('Bearer Token')}</label>
                    <div className="mcp-token-row">
                      <code className="mcp-token">{token}</code>
                      <button
                        className="btn btn-small btn-icon"
                        onClick={this._onCopyToken}
                        title={localized('Copy to clipboard')}
                      >
                        {tokenCopied ? (
                          localized('Copied!')
                        ) : (
                          <RetinaImg
                            name="icon-copytoclipboard.png"
                            mode={RetinaImg.Mode.ContentIsMask}
                          />
                        )}
                      </button>
                      <button
                        className="btn btn-small btn-icon"
                        onClick={this._onRegenerateToken}
                        title={localized('Regenerate token')}
                      >
                        <RetinaImg name="ic-refresh.png" mode={RetinaImg.Mode.ContentIsMask} />
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <section>
              <h6 style={{ marginTop: 0 }}>{localized('Account Access')}</h6>
              <p className="mcp-description">
                {localized(
                  'Choose which accounts and folders the MCP server can access. All accounts are enabled by default.'
                )}
              </p>
              <PreferencesMcpAccounts
                enabledAccounts={enabledAccounts}
                onChange={this._onAccountsChange}
              />
            </section>

            <section>
              <PreferencesMcpAudit />
            </section>
          </>
        )}
      </div>
    );
  }
}
