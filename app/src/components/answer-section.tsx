import React from 'react';
import { ICSParticipantStatus, localized } from 'mailspring-exports';
import { RetinaImg } from './retina-img';

/** The answers a guest can give, in the order every place that offers them lists them. */
export function rsvpActions(): [ICSParticipantStatus, string][] {
  return [
    ['ACCEPTED', localized('Yes')],
    ['DECLINED', localized('No')],
    ['TENTATIVE', localized('Maybe')],
  ];
}

interface AnswerSectionProps {
  /** The line above the buttons, such as where the answer is saved. */
  note?: React.ReactNode;
  /** The PARTSTAT the guest gave, drawn filled. */
  answer: string | null;
  /** An answer still being sent, drawn as a spinner. */
  sending?: ICSParticipantStatus;
  disabled?: boolean;
  onAnswer: (status: ICSParticipantStatus) => void;
}

/** An invitation's Yes / No / Maybe, as the event panel and the email's header both offer it. */
export const AnswerSection = ({
  note,
  answer,
  sending,
  disabled,
  onAnswer,
}: AnswerSectionProps) => (
  <div className="answer-section">
    {note && <div className="answer-section-note">{note}</div>}
    <div className="answer-section-buttons" role="group" aria-label={localized('Your response')}>
      {rsvpActions().map(([status, label]) => (
        <button
          key={status}
          className={`btn ${status === answer ? status : ''}`}
          aria-pressed={status === answer}
          disabled={disabled}
          onClick={() => onAnswer(status)}
        >
          {status === sending && status !== answer ? (
            <RetinaImg
              width={18}
              name="sending-spinner.gif"
              mode={RetinaImg.Mode.ContentPreserve}
            />
          ) : (
            label
          )}
        </button>
      ))}
    </div>
  </div>
);
