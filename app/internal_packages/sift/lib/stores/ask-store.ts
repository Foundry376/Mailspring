import MailspringStore from 'mailspring-store';
import { ask, streamBriefing, type AskHistory, type AskStep } from '../ai/ask';
import { describeError } from '../ai/client';

export interface Turn {
  id: number;
  role: 'user' | 'assistant';
  kind?: 'briefing';
  text: string;
  steps: AskStep[];
  error?: string;
  pending?: boolean;
}

/** The "Ask Sift" conversation. Kept in a store so it survives switching views. */
class AskStore extends MailspringStore {
  turns: Turn[] = [];
  private history: AskHistory = [];
  private controller: AbortController | null = null;
  private nextId = 1;

  get busy() {
    return !!this.controller;
  }

  reset() {
    this.stop();
    this.turns = [];
    this.history = [];
    this.trigger();
  }

  stop() {
    this.controller?.abort();
  }

  async ask(question: string) {
    if (this.busy || !question.trim()) return;
    this.turns.push({ id: this.nextId++, role: 'user', text: question.trim(), steps: [] });
    const { answer, signal } = this.startAnswer();
    try {
      this.history = await ask(
        question.trim(),
        this.history,
        {
          onText: (delta) => this.append(answer, delta),
          onStep: (step) => {
            const existing = answer.steps.findIndex((s) => s.id === step.id);
            if (existing >= 0) answer.steps[existing] = step;
            else answer.steps.push(step);
            this.trigger();
          },
        },
        signal
      );
    } catch (err) {
      if (!signal.aborted) answer.error = describeError(err);
    } finally {
      this.finish(answer);
    }
  }

  async briefing() {
    if (this.busy) return;
    const { answer, signal } = this.startAnswer('briefing');
    try {
      await streamBriefing({ onText: (delta) => this.append(answer, delta) }, signal);
    } catch (err) {
      if (!signal.aborted) answer.error = describeError(err);
    } finally {
      this.finish(answer);
    }
  }

  private startAnswer(kind?: 'briefing') {
    const answer: Turn = {
      id: this.nextId++,
      role: 'assistant',
      kind,
      text: '',
      steps: [],
      pending: true,
    };
    this.turns.push(answer);
    this.controller = new AbortController();
    this.trigger();
    return { answer, signal: this.controller.signal };
  }

  private append(turn: Turn, delta: string) {
    turn.text += delta;
    this.trigger();
  }

  private finish(turn: Turn) {
    turn.pending = false;
    turn.text = turn.text.trim();
    this.controller = null;
    this.trigger();
  }
}

export const askStore = new AskStore();
