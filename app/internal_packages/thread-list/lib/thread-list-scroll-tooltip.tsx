import React from 'react';
import { localized, DateUtils, Thread } from 'mailspring-exports';
import { ScrollRegionTooltipComponentProps } from 'mailspring-component-kit';
import ThreadListStore from './thread-list-store';

function indexFor({ viewportCenter, totalHeight }: ScrollRegionTooltipComponentProps) {
  return Math.floor((ThreadListStore.dataSource().count() / totalHeight) * viewportCenter);
}

const ThreadListScrollTooltip: React.FC<ScrollRegionTooltipComponentProps> = (props) => {
  const idx = indexFor(props);
  const item = ThreadListStore.dataSource().get(idx) as Thread | undefined;
  const content = item
    ? DateUtils.shortTimeString(item.lastMessageReceivedTimestamp)
    : localized('Loading...');
  return <div className="scroll-tooltip">{content}</div>;
};

ThreadListScrollTooltip.displayName = 'ThreadListScrollTooltip';

export default React.memo(
  ThreadListScrollTooltip,
  (prev, next) => indexFor(prev) === indexFor(next)
);
