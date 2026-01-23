import React from 'react';
import classNames from 'classnames';
import { localized } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import {
  UnsubscribeOption,
  UnsubscribeResult,
  performOneClickUnsubscribe,
  performMailtoUnsubscribe,
  performWebUnsubscribe,
} from './unsubscribe-service';

type UnsubscribeMethod = 'one-click' | 'mailto' | 'web' | 'body-link';

interface UnsubscribeHeaderProps {
  /** The unsubscribe option to use */
  option: UnsubscribeOption;
  /** The method to use for unsubscribing */
  method: UnsubscribeMethod;
}

type UnsubscribeState = 'idle' | 'loading' | 'success' | 'error';

interface UnsubscribeHeaderState {
  state: UnsubscribeState;
  errorMessage?: string;
}

/**
 * Displays an unsubscribe link in the message header area.
 *
 * Supports multiple unsubscribe methods:
 * - one-click: RFC 8058 HTTP POST (shows loading/success/error states)
 * - mailto: Opens composer with pre-filled unsubscribe email
 * - web/body-link: Opens URL in browser
 */
export class UnsubscribeHeader extends React.Component<
  UnsubscribeHeaderProps,
  UnsubscribeHeaderState
> {
  static displayName = 'UnsubscribeHeader';

  private _mounted = false;

  state: UnsubscribeHeaderState = {
    state: 'idle',
  };

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  componentDidUpdate(prevProps: UnsubscribeHeaderProps) {
    // Reset state when the unsubscribe option changes (e.g., navigating between messages)
    if (prevProps.option.uri !== this.props.option.uri) {
      this.setState({ state: 'idle', errorMessage: undefined });
    }
  }

  private _handleClick = async () => {
    // Prevent multiple clicks while an operation is in progress
    if (this.state.state !== 'idle') {
      return;
    }

    const { option, method } = this.props;

    switch (method) {
      case 'one-click':
        await this._performOneClick(option.uri);
        break;

      case 'mailto':
        await this._performMailto(option.uri);
        break;

      case 'web':
      case 'body-link':
        this._performWeb(option.uri);
        break;
    }
  };

  private async _performOneClick(url: string) {
    this.setState({ state: 'loading', errorMessage: undefined });

    const result: UnsubscribeResult = await performOneClickUnsubscribe(url);

    if (!this._mounted) return;

    if (result.success) {
      this.setState({ state: 'success' });
    } else {
      this.setState({ state: 'error', errorMessage: result.error });
    }
  }

  private _performMailto(uri: string) {
    try {
      performMailtoUnsubscribe(uri);
    } catch (err) {
      console.error('Failed to open unsubscribe email:', err);
    }
  }

  private _performWeb(url: string) {
    try {
      performWebUnsubscribe(url);
    } catch (err) {
      console.error('Failed to open unsubscribe URL:', err);
    }
  }

  private _handleRetry = () => {
    this.setState({ state: 'idle', errorMessage: undefined });
  };

  render() {
    const { state } = this.state;

    const className = classNames('unsubscribe-action', {
      'unsubscribe-loading': state === 'loading',
      'unsubscribe-success': state === 'success',
      'unsubscribe-error': state === 'error',
    });

    if (state === 'loading') {
      return (
        <span className={className}>
          <RetinaImg
            name="inline-loading-spinner.gif"
            mode={RetinaImg.Mode.ContentPreserve}
            className="unsubscribe-spinner"
          />
          {localized('Unsubscribing...')}
        </span>
      );
    }

    if (state === 'success') {
      return <span className={className}>{localized('Unsubscribed')}</span>;
    }

    if (state === 'error') {
      return (
        <span className={className}>
          <span className="unsubscribe-error-message">{localized('Unsubscribe failed')}</span>
          <a className="unsubscribe-retry" onClick={this._handleRetry}>
            {localized('Try again')}
          </a>
        </span>
      );
    }

    // Idle state - show clickable link
    return (
      <a className={className} onClick={this._handleClick}>
        {localized('Unsubscribe')}
      </a>
    );
  }
}

export default UnsubscribeHeader;
