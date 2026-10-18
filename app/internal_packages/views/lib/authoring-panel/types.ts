import { AccountUsage, LimitNotice } from '../agent/quota';

// The panel's view of the agent session. Mirrors the shapes exported by `lib/agent`, which owns
// the transport; the panel only reads these and calls the actions below.

export type AgentStatus =
  | 'connecting'
  | 'running'
  | 'idle'
  | 'budget_reached'
  | 'terminated'
  | 'error';

export interface ExampleChip {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet?: string;
  bytes?: number;
}

export type RequestKind = 'examples' | 'screenshot' | 'question';

export interface RevisionEntry {
  revision: number;
  status: 'applying' | 'ok' | 'failed' | 'timeout' | 'rejected' | 'unknown';
  summary?: string;
  ts?: number;
}

export interface TranscriptEntry {
  id: string;
  role: 'agent' | 'user' | 'system';
  text: string;
  attachments?: ExampleChip[];
  ts?: number;
  kind?: 'message' | 'request' | 'response' | 'revision';
  toolUseId?: string;
  requestKind?: RequestKind;
  revision?: RevisionEntry;
  thumbnail?: string;
}

export interface PendingRequest {
  toolUseId: string;
  kind: RequestKind;
  prompt: string;
  choices?: string[];
  screenshot?: {
    dataUrl: string;
    width: number;
    height: number;
    capturedAt?: number;
    /** Why the capture may not show the latest revision. */
    note?: string;
  };
}

export interface AgentSessionState {
  viewId: string;
  name: string;
  status: AgentStatus;
  working: boolean;
  transcript: TranscriptEntry[];
  pendingRequest: PendingRequest | null;
  attachedExamples: ExampleChip[];
  revisions: RevisionEntry[];
  usage: { listCostCents: number; maxListCostCents: number } | null;
  error: { code: string; message: string } | null;
  /** The account's allowance stopped a build, message or budget raise. */
  limit?: LimitNotice | null;
  /** Opened on a View with no conversation yet: the panel shows a compact composer. */
  intro?: boolean;
  canRevert?: boolean;
  /** A recoverable refusal shown as a calm notice: Retry, or a fresh chat for the View. */
  notice?: {
    code: 'rate_limited' | 'session_busy' | 'session_turn_limit';
    message: string;
    action: 'retry' | 'start_fresh';
  } | null;
  /** A refused message handed back to the composer; `seq` changes on each hand-back. */
  returnedDraft?: { text: string; seq: number } | null;
  /** The backend's message length cap, once reported. */
  messageLimit?: number | null;
}

export interface SessionStoreLike {
  session(viewId: string): AgentSessionState | null;
  activeViewId(): string | null;
  activeSession(): AgentSessionState | null;
  /** The account's View-building allowance, when known. */
  accountUsage(): AccountUsage | null;
  listen(callback: () => void): () => void;
}

export interface SessionActionsLike {
  setActive(viewId: string | null): Promise<void>;
  sendMessage(viewId: string, text: string): Promise<void>;
  /** Re-sends the message a `rate_limited` refused. */
  retry(viewId: string): Promise<void>;
  /** Makes the next message start a fresh chat for the View. */
  startFresh(viewId: string): Promise<void>;
  attachThreads(viewId: string, threadIds: string[]): Promise<void>;
  removeAttachment(viewId: string, messageId: string): Promise<void>;
  submitExamples(viewId: string): Promise<void>;
  skipExamples(viewId: string): Promise<void>;
  answerQuestion(viewId: string, answer: string): Promise<void>;
  approveScreenshot(viewId: string): Promise<void>;
  /** Recaptures the View for an open screenshot request. */
  refreshScreenshot(viewId: string): Promise<void>;
  declineScreenshot(viewId: string): Promise<void>;
  interrupt(viewId: string): Promise<void>;
  raiseBudget(viewId: string): Promise<void>;
  /** Re-fetches the account's allowance. */
  refreshUsage(): Promise<void>;
  /** Reopens the upgrade prompt for the View's limit notice. */
  showUpgrade(viewId: string): Promise<void>;
  stopBudget(viewId: string): Promise<void>;
  /** Restores the View as it was before the latest request that changed it. */
  revert(viewId: string): Promise<void>;
  /** Shows the panel for a View, attaching to its server session if it has one. */
  open(viewId: string, name: string): Promise<void>;
  /** Suggests composer text the user can edit before sending. */
  prefill(viewId: string, text: string): Promise<void>;
}
