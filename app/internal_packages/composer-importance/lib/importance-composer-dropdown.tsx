import React from 'react';
import {
  localized,
  DraftEditingSession,
  Account,
  MessageWithEditorState,
} from 'mailspring-exports';
import { Menu, ButtonDropdown } from 'mailspring-component-kit';

const MenuItem = Menu.Item;

type ImportanceLevel = '' | 'high' | 'low';

const OPTIONS: { value: ImportanceLevel; label: string }[] = [
  { value: 'high', label: localized('High') },
  { value: '', label: localized('Normal') },
  { value: 'low', label: localized('Low') },
];

const HighIcon = (
  <svg
    className="importance-button"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path fill="#d33b2f" d="M12 2 L15.5 14 H8.5 Z M10.5 16 H13.5 V19 H10.5 Z" />
  </svg>
);

const LowIcon = (
  <svg
    className="importance-button low"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      d="M11 3 H13 V14 H17 L12 21 L7 14 H11 Z"
      opacity="0.55"
    />
  </svg>
);

const NormalIcon = (
  <svg
    className="importance-button normal"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      d="M5 11 H19 V13 H5 Z"
      opacity="0.55"
    />
  </svg>
);

function iconForLevel(level: ImportanceLevel) {
  if (level === 'high') return HighIcon;
  if (level === 'low') return LowIcon;
  return NormalIcon;
}

interface Props {
  draft: MessageWithEditorState;
  draftFromEmail: string;
  session: DraftEditingSession;
  accounts: Account[];
}

export default class ImportanceComposerDropdown extends React.Component<Props> {
  static displayName = 'ImportanceComposerDropdown';

  static containerRequired = false;

  _onSelect = (option: { value: ImportanceLevel }) => {
    this.props.session.changes.add({ importance: option.value });
  };

  render() {
    const current: ImportanceLevel = (this.props.draft.importance as ImportanceLevel) || '';
    const label = localized('Message importance');

    return (
      <div
        className={`importance-button-dropdown importance-${current || 'normal'}`}
        title={label}
      >
        <ButtonDropdown
          bordered={false}
          primaryItem={iconForLevel(current)}
          menu={
            <Menu
              items={OPTIONS}
              itemKey={(opt) => opt.value || 'normal'}
              itemChecked={(opt) => opt.value === current}
              itemContent={(opt) => (
                <span className={`importance-option importance-option-${opt.value || 'normal'}`}>
                  {opt.label}
                </span>
              )}
              onSelect={this._onSelect}
            />
          }
        />
      </div>
    );
  }
}
