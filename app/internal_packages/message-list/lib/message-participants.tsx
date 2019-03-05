import _ from 'underscore';
import classnames from 'classnames';
import React from 'react';
import { localized, Actions, Contact } from 'mailspring-exports';
import { remote } from 'electron';

const { Menu, MenuItem } = remote;
const MAX_COLLAPSED = 5;

interface MessageParticipantsProps {
  to: Contact[];
  cc: Contact[];
  bcc: Contact[];
  replyTo: Contact[];
  from: Contact[];
  onClick?: (e: React.MouseEvent<any>) => void;
  isDetailed: boolean;
}
export default class MessageParticipants extends React.Component<MessageParticipantsProps> {
  static displayName = 'MessageParticipants';

  static defaultProps = {
    to: [],
    cc: [],
    bcc: [],
    from: [],
    replyTo: [],
  };

  // Helpers

  _allToParticipants() {
    return _.union(this.props.to, this.props.cc, this.props.bcc);
  }

  _shortNames(contacts = [], max = MAX_COLLAPSED) {
    let names = contacts.map(c => c.displayName({ includeAccountLabel: true, compact: true }));
    if (names.length > max) {
      const extra = names.length - max;
      names = names.slice(0, max);
      names.push(`and ${extra} more`);
    }
    return names.join(', ');
  }

  _onSelectText = e => {
    e.preventDefault();
    e.stopPropagation();

    const textNode = e.currentTarget.childNodes[0];
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.length);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  _onContactContextMenu = contact => {
    const menu = new Menu();
    menu.append(new MenuItem({ role: 'copy' }));
    menu.append(
      new MenuItem({
        label: `${localized(`Email`)} ${contact.email}`,
        click: () => Actions.composeNewDraftToRecipient(contact),
      })
    );
    menu.popup({});
  };

  _renderFullContacts(contacts = []) {
    return contacts.map((c, i) => {
      let comma = ',';
      if (contacts.length === 1 || i === contacts.length - 1) {
        comma = '';
      }

      if (c.name && c.name.length > 0 && c.name !== c.email) {
        return (
          <div key={`${c.email}-${i}`} className="participant selectable">
            <div className="participant-primary" onClick={this._onSelectText}>
              {c.fullName()}
            </div>
            <div className="participant-secondary">
              {' <'}
              <span
                onClick={this._onSelectText}
                onContextMenu={() => this._onContactContextMenu(c)}
              >
                {c.email}
              </span>
              {`>${comma}`}
            </div>
          </div>
        );
      }
      return (
        <div key={`${c.email}-${i}`} className="participant selectable">
          <div className="participant-primary">
            <span onClick={this._onSelectText} onContextMenu={() => this._onContactContextMenu(c)}>
              {c.email}
            </span>
            {comma}
          </div>
        </div>
      );
    });
  }

  _renderExpandedField(name, label, field, { includeLabel = true } = {}) {
    return (
      <div className="participant-type" key={`participant-type-${name}`}>
        {includeLabel ? (
          <div className={`participant-label ${name}-label`}>{label}:&nbsp;</div>
        ) : null}
        <div className={`participant-name ${name}-contact`}>{this._renderFullContacts(field)}</div>
      </div>
    );
  }

  _renderExpanded() {
    const { from, replyTo, to, cc, bcc } = this.props;

    const expanded = [];

    if (from.length > 0) {
      expanded.push(
        this._renderExpandedField('from', localized('From'), from, { includeLabel: false })
      );
    }

    if (replyTo.length > 0) {
      expanded.push(this._renderExpandedField('reply-to', localized('Reply to'), replyTo));
    }

    if (to.length > 0) {
      expanded.push(this._renderExpandedField('to', localized('To'), to));
    }

    if (cc.length > 0) {
      expanded.push(this._renderExpandedField('cc', localized('Cc'), cc));
    }

    if (bcc.length > 0) {
      expanded.push(this._renderExpandedField('bcc', localized('Bcc'), bcc));
    }

    return <div className="expanded-participants">{expanded}</div>;
  }

  _renderCollapsed() {
    const childSpans = [];
    const toParticipants = this._allToParticipants();

    if (this.props.from.length > 0) {
      childSpans.push(
        <span className="participant-name from-contact" key="from">
          {this._shortNames(this.props.from)}
        </span>
      );
    }

    if (toParticipants.length > 0) {
      childSpans.push(
        <span className="participant-label to-label" key="to-label">
          {localized('To')}:&nbsp;
        </span>,
        <span className="participant-name to-contact" key="to-value">
          {this._shortNames(toParticipants)}
        </span>
      );
    }

    return <span className="collapsed-participants">{childSpans}</span>;
  }

  render() {
    const { isDetailed, from, onClick } = this.props;
    const classSet = classnames({
      participants: true,
      'message-participants': true,
      collapsed: !isDetailed,
      'from-participants': from.length > 0,
      'to-participants': this._allToParticipants().length > 0,
    });

    return (
      <div className={classSet} onClick={onClick}>
        {isDetailed ? this._renderExpanded() : this._renderCollapsed()}
      </div>
    );
  }
}
