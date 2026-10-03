/**
 * Wire and UI types for building a View with the hosted authoring agent. The wire half mirrors
 * docs/plans/views-agent-protocol.md; the rest is the state the floating authoring panel renders.
 */

export interface ExampleContact {
  name: string;
  email: string;
}

/** One example email as it is sent to the agent. Built by examples.ts, never by a View. */
export interface Example {
  messageId: string;
  threadId: string;
  from: ExampleContact[];
  to: ExampleContact[];
  cc: ExampleContact[];
  subject: string;
  date: string;
  text: string;
  html: string;
}

export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; dataBase64: string };

export type AgentEvent =
  | { id: string; type: 'status'; status: 'running' | 'idle' | 'budget_reached' | 'terminated' }
  | { id: string; type: 'message'; text: string }
  | { id: string; type: 'user_message'; text: string; exampleCount?: number }
  | { id: string; type: 'thinking' }
  | {
      id: string;
      type: 'tool_request';
      toolUseId: string;
      name: string;
      input: any;
      signature?: string;
      /** True on replayed requests the session already has a result for. */
      resolved?: boolean;
    }
  | { id: string; type: 'error'; code: string; message: string }
  | { id: string; type: 'usage'; listCostCents: number; maxListCostCents: number };

export type AgentStatus =
  | 'connecting'
  | 'running'
  | 'idle'
  | 'budget_reached'
  | 'terminated'
  | 'error';

/** What the panel shows for an attached example: enough to recognize it, nothing more. */
export interface ExampleChip {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  bytes: number;
}

export interface TranscriptEntry {
  id: string;
  role: 'agent' | 'user' | 'system';
  /** Markdown for agent messages, plain text otherwise. */
  text: string;
  attachments?: ExampleChip[];
  ts: number;
}

export interface PendingRequest {
  toolUseId: string;
  kind: 'examples' | 'screenshot' | 'question';
  prompt: string;
  choices?: string[];
  screenshot?: { dataUrl: string; width: number; height: number };
}

export interface RevisionEntry {
  revision: number;
  status: 'previewing' | 'ok' | 'failed' | 'timeout' | 'rejected';
  summary: string;
  ts: number;
}

export interface AgentSessionState {
  viewId: string;
  name: string;
  status: AgentStatus;
  /** True while the agent is taking a turn (between a sent message and its next idle). */
  working: boolean;
  transcript: TranscriptEntry[];
  pendingRequest: PendingRequest | null;
  /** Examples the user has dropped on the panel that haven't been sent yet. */
  attachedExamples: ExampleChip[];
  revisions: RevisionEntry[];
  usage: { listCostCents: number; maxListCostCents: number } | null;
  error: { code: string; message: string } | null;
}

export class AgentAPIError extends Error {
  statusCode: number;
  code: string;
  details: any;

  constructor(message: string, { statusCode = 0, code = 'unknown', details = null } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
