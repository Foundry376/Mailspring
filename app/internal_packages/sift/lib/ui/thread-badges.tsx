import React from 'react';
import { insightStore } from '../stores/insight-store';
import { SparkleIcon, useStores } from './helpers';

/**
 * Rendered in the `Thread:MailLabel` slot. In the thread list it adds priority
 * and reply chips and replaces the snippet with Sift's one-line summary (the
 * stylesheet hides the original snippet when a summary is present). In the
 * reading pane's subject line it shows the chips only.
 */
export function ThreadBadges({ thread, messages }: { thread: any; messages?: any[] }) {
  useStores(insightStore);
  if (!thread) return null;
  const inList = messages === undefined;
  const insight = insightStore.get(thread.id);
  const status = insightStore.statusFor(thread.id);

  if (!insight) {
    if (inList && status === 'running') {
      return (
        <span className="sift-summary sift-summary-loading">
          <SparkleIcon size={11} /> Reading…
        </span>
      );
    }
    return null;
  }

  const chips: React.ReactNode[] = [];
  if (insight.security_warning) {
    chips.push(
      <span key="sec" className="sift-chip sift-chip-danger" title={insight.security_warning}>
        Suspicious
      </span>
    );
  }
  if (insight.priority === 'urgent')
    chips.push(
      <span key="p" className="sift-chip sift-chip-urgent">
        Urgent
      </span>
    );
  else if (insight.priority === 'high')
    chips.push(
      <span key="p" className="sift-chip sift-chip-high">
        High
      </span>
    );
  if (insight.needs_reply && !insight.security_warning)
    chips.push(
      <span key="r" className="sift-chip sift-chip-reply">
        Reply
      </span>
    );

  return (
    <span className="sift-badges">
      {inList && (
        <span className="sift-summary" title={insight.brief}>
          <SparkleIcon size={11} /> {insight.summary}
        </span>
      )}
      {chips}
    </span>
  );
}
ThreadBadges.displayName = 'SiftThreadBadges';
