import React from 'react';
const { shell } = require('electron');
import { localized } from 'mailspring-exports';

interface UnsubscribeHeaderProps {
  unsubscribeAction: string;
}

/*
The UnsubscribeHeader allows you to unsubscribe from a mailinglist easily using either
the e-mail address denoted in the unsubscribe header of the e-mail or an unsubscribe
link from the e-mail message itself.
*/
export class UnsubscribeHeader extends React.Component<UnsubscribeHeaderProps> {
  static displayName = 'UnsubscribeHeader';

  render() {
    const { unsubscribeAction } = this.props;
    return (
      <a className="unsubscribe-action" onClick={() => this._unsubscribe(unsubscribeAction)}>
        {localized('Unsubscribe')}
      </a>
    );
  }

  private _unsubscribe(url: string) {
    if (/^https?:\/\/.+/i.test(url)) {
      shell.openExternal(url);
    }
  }
}

export default UnsubscribeHeader;
