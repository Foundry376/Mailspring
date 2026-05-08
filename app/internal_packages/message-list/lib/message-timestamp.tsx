import React from 'react';
import { DateUtils } from 'mailspring-exports';

interface MessageTimestampProps {
  date: Date;
  className?: string;
  isDetailed?: boolean;
  onClick?: () => void;
}
const MessageTimestamp: React.FC<MessageTimestampProps> = React.memo(
  ({ date, className, isDetailed, onClick }) => (
    <div className={className} title={DateUtils.fullTimeString(date)} onClick={onClick}>
      {isDetailed ? DateUtils.mediumTimeString(date) : DateUtils.shortTimeString(date)}
    </div>
  ),
  (prev, next) => prev.date === next.date && prev.isDetailed === next.isDetailed
);
MessageTimestamp.displayName = 'MessageTimestamp';

export default MessageTimestamp;
