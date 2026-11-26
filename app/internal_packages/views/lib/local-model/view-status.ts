import { EventEmitter } from 'events';
import { AIStore, LocalModelStore } from 'mailspring-exports';
import type { LocalAIStatus, LocalModelStatus } from 'mailspring-exports';

/** What `ai.extract` / `ai.summarize` / `ai.generate` report to Views about the model. */
export type ModelStatusForViews = 'ready' | 'model_downloading' | 'model_off' | 'model_unavailable';

/**
 * `viewId` is the View the status is for: with OpenRouter selected, a View the user hasn't
 * allowed to send mail there reads `model_off`.
 */
export function modelStatusForViews(
  status: LocalModelStatus | null,
  viewId?: string
): {
  modelStatus: ModelStatusForViews;
  modelProgress?: number;
} {
  if (AIStore.isEnabled() && AIStore.backend().remote) {
    if (viewId && remoteAIDecision(viewId) !== 'allowed') return { modelStatus: 'model_off' };
    return { modelStatus: AIStore.hasOpenRouterKey() ? 'ready' : 'model_unavailable' };
  }
  if (!status) return { modelStatus: 'model_unavailable' };
  const { state } = status;
  switch (state.kind) {
    case 'system':
    case 'ready':
      return { modelStatus: 'ready' };
    case 'downloading':
      return {
        modelStatus: 'model_downloading',
        modelProgress: state.totalBytes ? state.receivedBytes / state.totalBytes : 0,
      };
    case 'disabled':
      return { modelStatus: 'model_off' };
    default:
      return { modelStatus: 'model_unavailable' };
  }
}

const DISMISSED_KEY = 'core.views.aiPromptDismissed';
const REMOTE_KEY = 'core.views.remoteAI';

/**
 * Events for a View's host (view-host.tsx):
 * - `wants-ai` (viewId): the View asked for AI and got no answers, because AI is off or the
 *   model isn't ready. The host reloads it once the model is ready, and while AI is off covers
 *   it with EnableAIPrompt unless the user chose Not Now for it.
 * - `wants-remote-ai` (viewId): AI runs on OpenRouter and the user hasn't decided whether this
 *   View may send mail there. The host asks.
 */
export const ViewAIEvents = new EventEmitter();
ViewAIEvents.setMaxListeners(100);

function dismissedViews(): string[] {
  return AppEnv.config.get(DISMISSED_KEY) || [];
}

/**
 * Not Now is remembered per View, so every new View that uses AI asks once: many behave
 * unpredictably without it.
 */
export function dismissAIPrompt(viewId: string) {
  if (!dismissedViews().includes(viewId)) {
    AppEnv.config.set(DISMISSED_KEY, [...dismissedViews(), viewId]);
  }
}

export function aiPromptDismissed(viewId: string) {
  return dismissedViews().includes(viewId);
}

type RemoteDecision = 'allowed' | 'declined';

function remoteDecisions(): { [viewId: string]: RemoteDecision } {
  return AppEnv.config.get(REMOTE_KEY) || {};
}

/**
 * Whether the user lets a View send the mail it asks AI about to OpenRouter. Asked once per
 * View, like its other grants, because a View's consent card promises its mail goes nowhere.
 */
export function remoteAIDecision(viewId: string): RemoteDecision | undefined {
  return remoteDecisions()[viewId];
}

export function setRemoteAIDecision(viewId: string, decision: RemoteDecision | null) {
  const next = { ...remoteDecisions() };
  if (decision) next[viewId] = decision;
  else delete next[viewId];
  AppEnv.config.set(REMOTE_KEY, next);
}

/** Drops Not Now and the OpenRouter decision for a View that's been removed. */
export function forgetAIPromptDismissal(viewId: string) {
  if (remoteAIDecision(viewId)) setRemoteAIDecision(viewId, null);
  if (dismissedViews().includes(viewId)) {
    AppEnv.config.set(
      DISMISSED_KEY,
      dismissedViews().filter((id) => id !== viewId)
    );
  }
}

/**
 * Whether a View's prompts can run now. Asking never starts a download, and with OpenRouter
 * selected nothing is sent for a View the user hasn't allowed to.
 */
export async function localAIForViews(viewId: string): Promise<LocalAIStatus> {
  const status = await LocalModelStore.availability();
  if (status.remote && status.available && remoteAIDecision(viewId) !== 'allowed') {
    if (!remoteAIDecision(viewId)) ViewAIEvents.emit('wants-remote-ai', viewId);
    return { ...status, available: false };
  }
  if (!status.available) ViewAIEvents.emit('wants-ai', viewId);
  return status;
}
