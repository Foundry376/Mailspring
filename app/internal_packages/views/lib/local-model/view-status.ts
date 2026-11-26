import { EventEmitter } from 'events';
import { LocalModelStore } from 'mailspring-exports';
import type { LocalAIStatus, LocalModelStatus } from 'mailspring-exports';

/** What `ai.extract` / `ai.summarize` / `ai.generate` report to Views about the model. */
export type ModelStatusForViews = 'ready' | 'model_downloading' | 'model_off' | 'model_unavailable';

export function modelStatusForViews(status: LocalModelStatus | null): {
  modelStatus: ModelStatusForViews;
  modelProgress?: number;
} {
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

/**
 * `wants-ai` (viewId): a View asked for AI and got no answers, because AI is off or the model
 * isn't ready. Its host reloads it once the model is ready, and while AI is off covers it with
 * EnableAIPrompt unless the user chose Not Now for it (view-host.tsx).
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

export function forgetAIPromptDismissal(viewId: string) {
  if (dismissedViews().includes(viewId)) {
    AppEnv.config.set(
      DISMISSED_KEY,
      dismissedViews().filter((id) => id !== viewId)
    );
  }
}

/** Whether a View's prompts can run now. Asking never starts a download. */
export async function localAIForViews(viewId: string): Promise<LocalAIStatus> {
  const status = await LocalModelStore.availability();
  if (!status.available) ViewAIEvents.emit('wants-ai', viewId);
  return status;
}
