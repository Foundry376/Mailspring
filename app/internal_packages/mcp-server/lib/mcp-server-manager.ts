import MailspringStore from 'mailspring-store';
import { McpHttpServer } from './mcp-http-server';

class McpServerManagerStore extends MailspringStore {
  private _server: McpHttpServer = new McpHttpServer();
  private _error: string | null = null;
  private _configDisposable: { dispose: () => void } | null = null;
  private _lastSnapshot: { enabled: boolean; port: number } | null = null;

  activate() {
    this._configDisposable = AppEnv.config.onDidChange('core.mcp', () => {
      this._reconcileServerState();
    });
    this._reconcileServerState();
  }

  deactivate() {
    if (this._configDisposable) {
      this._configDisposable.dispose();
      this._configDisposable = null;
    }
    this._server.stop();
  }

  isRunning(): boolean {
    return this._server.isRunning();
  }

  getError(): string | null {
    return this._error;
  }

  getToken(): string {
    let token = AppEnv.config.get('core.mcp.token');
    if (!token) {
      token = crypto.randomUUID();
      AppEnv.config.set('core.mcp.token', token);
    }
    return token;
  }

  regenerateToken() {
    const token = crypto.randomUUID();
    AppEnv.config.set('core.mcp.token', token);
    // The server reads the token dynamically on each request (see
    // McpHttpServer.start's getToken callback), so this does not require
    // (and will not trigger) a server restart.
  }

  private async _reconcileServerState() {
    const enabled = AppEnv.config.get('core.mcp.enabled') || false;
    const port = AppEnv.config.get('core.mcp.port') || 2587;

    // Only `enabled` and `port` require the HTTP server to actually
    // stop/start — accessLevel and enabledAccounts are read live on every
    // tool call (see mcp-access-control.ts), and the token is looked up
    // dynamically per-request, so changes to those must not interrupt any
    // live client sessions.
    const snapshot = { enabled, port };
    const changed =
      !this._lastSnapshot ||
      this._lastSnapshot.enabled !== snapshot.enabled ||
      this._lastSnapshot.port !== snapshot.port;
    this._lastSnapshot = snapshot;

    if (!changed) {
      return;
    }

    if (!enabled) {
      if (this._server.isRunning()) {
        await this._server.stop();
        this._error = null;
        this.trigger();
      }
      return;
    }

    // enabled or port changed — restart to (re)bind the listener.
    try {
      await this._server.stop();
      await this._server.start(port, () => this.getToken());
      this._error = null;
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'EADDRINUSE') {
        this._error = `Port ${port} is already in use. Choose a different port.`;
      } else {
        this._error = nodeErr.message || 'Unknown error starting MCP server';
      }
      console.error('[MCP Server]', this._error);
    }
    this.trigger();
  }
}

export default new McpServerManagerStore();
