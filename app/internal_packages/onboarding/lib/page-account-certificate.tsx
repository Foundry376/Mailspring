import { ipcRenderer } from 'electron';
import React from 'react';
import { localized, Account } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

import * as OnboardingActions from './onboarding-actions';
import { finalizeAndValidateAccount } from './onboarding-helpers';
import FormErrorMessage from './form-error-message';
import {
  RejectedCertificate,
  CertificateDescription,
  describeRejectedCertificate,
  withAcceptedCertificates,
} from './certificate-review';

interface AccountCertificatePageProps {
  account: Account;
  rejectedCertificates: RejectedCertificate[];
}

interface AccountCertificatePageState {
  submitting: boolean;
  errorMessage?: string;
  errorLog?: string;
}

const ServiceLabels = {
  imap: () => localized('Incoming Mail') + ' (IMAP)',
  smtp: () => localized('Outgoing Mail') + ' (SMTP)',
};

// Shown when a server's certificate fails validation. Accepting stores each certificate's
// fingerprint in the account, and mailsync then trusts exactly those certificates: if a server
// later presents a different one, the account stops connecting until the user reviews it again.
export default class AccountCertificatePage extends React.Component<
  AccountCertificatePageProps,
  AccountCertificatePageState
> {
  static displayName = 'AccountCertificatePage';

  state: AccountCertificatePageState = { submitting: false };

  componentDidMount() {
    ipcRenderer.send('resize-window', { width: 900, height: 660 });
  }

  _onAccept = async () => {
    const { account, rejectedCertificates } = this.props;
    const accepted = withAcceptedCertificates(account, rejectedCertificates);
    this.setState({ submitting: true, errorMessage: null, errorLog: null });

    try {
      const validated = await finalizeAndValidateAccount(accepted);
      OnboardingActions.moveToPage('account-onboarding-success');
      OnboardingActions.finishAndAddAccount(validated);
    } catch (err) {
      if (err.certificates?.length) {
        // A server presented a certificate other than the one just reviewed.
        this.setState({ submitting: false });
        OnboardingActions.setAccount(accepted, { rejectedCertificates: err.certificates });
        return;
      }
      // Keep the accepted fingerprints, so going back to correct a password doesn't ask again.
      OnboardingActions.setAccount(accepted, { rejectedCertificates });
      this.setState({ submitting: false, errorMessage: err.message, errorLog: err.rawLog });
    }
  };

  _renderCertificate(services: RejectedCertificate[], description: CertificateDescription) {
    const { sha256 } = services[0];
    return (
      <div className="certificate" key={sha256 + services[0].host}>
        <div className="certificate-servers">
          {services.map((s) => (
            <div key={s.service}>
              {ServiceLabels[s.service]()}: <strong>{`${s.host}:${s.port}`}</strong>
            </div>
          ))}
        </div>
        {description ? (
          <>
            <ul className="certificate-problems">
              {description.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
            <dl>
              <dt>{localized('Issued to')}</dt>
              <dd>
                {description.names.length ? description.names.join(', ') : description.issuedTo}
              </dd>
              <dt>{localized('Issued by')}</dt>
              <dd>{description.issuedBy}</dd>
              <dt>{localized('Valid')}</dt>
              <dd>
                {description.validFrom.toLocaleDateString()} –{' '}
                {description.validTo.toLocaleDateString()}
              </dd>
              <dt>SHA-256</dt>
              <dd className="fingerprint">{description.fingerprint}</dd>
            </dl>
          </>
        ) : (
          <dl>
            <dt>SHA-256</dt>
            <dd className="fingerprint">{sha256}</dd>
          </dl>
        )}
      </div>
    );
  }

  _renderCertificates() {
    // ProtonMail Bridge and most self-hosted servers present one certificate for both services.
    const groups = new Map<string, RejectedCertificate[]>();
    for (const rejected of this.props.rejectedCertificates) {
      const key = `${rejected.sha256} ${rejected.host}`;
      groups.set(key, [...(groups.get(key) || []), rejected]);
    }
    return [...groups.values()].map((services) => {
      let description: CertificateDescription = null;
      try {
        description = describeRejectedCertificate(services[0]);
      } catch (err) {
        console.warn(`Could not read the certificate presented by ${services[0].host}`, err);
      }
      return this._renderCertificate(services, description);
    });
  }

  _renderAcceptButton() {
    if (this.state.submitting) {
      return (
        <button className="btn btn-large btn-disabled btn-add-account spinning">
          <RetinaImg
            name="sending-spinner.gif"
            width={15}
            height={15}
            mode={RetinaImg.Mode.ContentPreserve}
          />
          {localized('Adding account')}&hellip;
        </button>
      );
    }
    return (
      <button className="btn btn-large btn-gradient btn-add-account" onClick={this._onAccept}>
        {localized('Accept and Connect')}
      </button>
    );
  }

  render() {
    const { errorMessage, errorLog } = this.state;

    return (
      <div className="page account-setup AccountCertificatePage">
        <h2>{localized("Mailspring can't verify this server's identity")}</h2>
        <FormErrorMessage
          message={errorMessage}
          log={errorLog}
          empty={localized(
            'Another server could be posing as your mail server to collect your password and mail. Connect only if you expected this, for example with ProtonMail Bridge or a server you run yourself, and the certificate below is the one your server uses.'
          )}
        />
        <div className="certificates">{this._renderCertificates()}</div>
        <div>
          <div
            className="btn btn-large btn-gradient"
            onClick={() => OnboardingActions.moveToPreviousPage()}
          >
            {localized('Back')}
          </div>
          {this._renderAcceptButton()}
        </div>
      </div>
    );
  }
}
