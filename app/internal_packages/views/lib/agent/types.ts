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
  | {
      id: string;
      type: 'tool_result';
      toolUseId: string;
      name?: string;
      isError?: boolean;
      /** What the user did, for rebuilding the transcript on replay. See ToolResultSummary. */
      summary?: ToolResultSummary;
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

/**
 * How a client tool call was answered, as replayed by the backend so a relaunched client can
 * show the user's side of each request. Every field is optional; absent means unknown.
 */
export interface ToolResultSummary {
  examples?: number;
  skipped?: boolean;
  answer?: string;
  screenshot?: boolean;
  declined?: boolean;
  status?: 'ok' | 'failed' | 'timeout' | 'rejected';
}

export type RequestKind = 'examples' | 'screenshot' | 'question';

/**
 * One row of the panel's chat, in the order things happened. Plain messages have no `kind`;
 * an agent request and the revision cards are entries too, so they stay where they occurred
 * instead of floating at the bottom.
 */
export interface TranscriptEntry {
  id: string;
  role: 'agent' | 'user' | 'system';
  /** Markdown for agent messages and requests, plain text otherwise. */
  text: string;
  attachments?: ExampleChip[];
  ts: number;
  kind?: 'message' | 'request' | 'response' | 'revision';
  /** Request and response entries: the tool call they belong to. */
  toolUseId?: string;
  requestKind?: RequestKind;
  /** Revision entries. Updated in place as the preview progresses. */
  revision?: RevisionEntry;
  /** A sent screenshot, kept locally so the user can see what they shared. */
  thumbnail?: string;
}

export interface PendingRequest {
  toolUseId: string;
  kind: RequestKind;
  prompt: string;
  choices?: string[];
  /** Screenshot requests: the latest capture, refreshed while the request is open. */
  screenshot?: {
    dataUrl: string;
    width: number;
    height: number;
    capturedAt?: number;
    /** Why the capture may not show the latest revision. */
    note?: string;
  };
}

export interface RevisionEntry {
  revision: number;
  /** 'unknown' marks a revision rebuilt from replay before its outcome is known. */
  status: 'previewing' | 'ok' | 'failed' | 'timeout' | 'rejected' | 'unknown';
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
