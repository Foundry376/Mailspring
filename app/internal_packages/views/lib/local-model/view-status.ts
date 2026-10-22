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

/** A View asking for the model counts as using it, so the first ask starts the download. */
export function localAIForViews(): Promise<LocalAIStatus> {
  LocalModelStore.prepare().catch(() => {});
  return LocalModelStore.availability();
}
