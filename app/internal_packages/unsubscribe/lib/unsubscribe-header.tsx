import React from 'react';
const { shell } = require('electron')
import {
  localized,
  Message,
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

interface UnsubscribeHeaderProps {
  message: Message;
  unsubscribeAction: UnsubscribeAction;
}

interface UnsubscribeHeaderState {
}


interface UnsubscribeAction {
  href: string;
  innerText: string;
}

/*
The UnsubscribeHeader allows you to unsubscribe from a mailinglist easily using either
the e-mail address denoted in the unsubscribe header of the e-mail or an unsubscribe
link from the e-mail message itself.
*/
export class UnsubscribeHeader extends React.Component<UnsubscribeHeaderProps, UnsubscribeHeaderState> {
  static displayName = 'UnsubscribeHeader';

  state = {};
  unsubscribeAction: UnsubscribeAction;

  componentWillUnmount() {
  }

  componentDidMount() {
    // const { message, unsubscribeAction } = this.props;
  }

  componentDidUpdate(prevProps, prevState) {
  }

  render() {
    const { unsubscribeAction } = this.props;
    return (
      <div className="unsubscribe-wrapper">
        <div className="unsubscribe-header">
          <div className="unsubscribe-button">
            <RetinaImg name="toolbar-unsubscribe.png" onClick={() => this._unsubscribe(unsubscribeAction.href)} mode={RetinaImg.Mode.ContentIsMask} />
          </div>
          <span className="unsubscribe-title-text">{localized('Unsubscribe')}: </span>
          <span className="unsubscribe-title">{unsubscribeAction.innerText}</span>
        </div>
        <div className="unsubscribe-body">
          <div className="unsubscribe-action">
            <div className="btn btn-large btn-unsubscribe" onClick={() => this._unsubscribe(unsubscribeAction.href)}>{localized('Unsubscribe')}</div>
          </div>
        </div>
      </div>
    );
  }

  private _unsubscribe(url: string) {
    shell.openExternal(url);
  }

}

export default UnsubscribeHeader;
