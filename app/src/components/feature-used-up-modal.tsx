import React from 'react';
import PropTypes from 'prop-types';
import { shell } from 'electron';
import { localized } from 'mailspring-exports';
import * as Actions from '../flux/actions';
import { RetinaImg } from './retina-img';
import BillingModal from './billing-modal';
import { IdentityStore } from '../flux/stores/identity-store';

export default class FeatureUsedUpModal extends React.Component<{
  modalClass: string;
  iconUrl: string;
  rechargeText: string;
  headerText: string;
}> {
  static propTypes = {
    modalClass: PropTypes.string.isRequired,
    headerText: PropTypes.string.isRequired,
    rechargeText: PropTypes.string.isRequired,
    iconUrl: PropTypes.string.isRequired,
  };

  private _fetchPromise: Promise<string>;

  componentDidMount() {
    this._fetchPromise = IdentityStore.fetchSingleSignOnURL('/payment?embedded=true');
  }

  onGoToFeatures = () => {
    shell.openExternal('https://getmailspring.com/pro');
  };

  onUpgrade = async e => {
    // Retrieve the SSO URL for the billing modal or wait for it to be retrieved
    // before opening the modal.
    const upgradeUrl = await this._fetchPromise;

    e.stopPropagation();
    Actions.openModal({
      component: <BillingModal source="feature-limit" upgradeUrl={upgradeUrl} />,
      width: BillingModal.IntrinsicWidth,
      height: BillingModal.IntrinsicHeight,
    });
  };

  render() {
    return (
      <div className={`feature-usage-modal ${this.props.modalClass}`}>
        <div className="feature-header">
          <div className="icon">
            <RetinaImg
              url={this.props.iconUrl}
              style={{ position: 'relative', top: '-2px' }}
              mode={RetinaImg.Mode.ContentPreserve}
            />
          </div>
          <h2 className="header-text">{this.props.headerText}</h2>
          <p className="recharge-text">{this.props.rechargeText}</p>
        </div>
        <div className="feature-cta">
          <div className="pro-description">
            <h3>{localized('Upgrade to Mailspring Pro')}</h3>
            <ul>
              <li>{localized('Unlimited Connected Accounts')}</li>
              <li>{localized('Unlimited Contact Profiles')}</li>
              <li>{localized('Unlimited Snoozing')}</li>
              <li>{localized('Unlimited Read Receipts')}</li>
              <li>{localized('Unlimited Link Tracking')}</li>
              <li>{localized('Unlimited Reminders')}</li>
              <li>
                <a onClick={this.onGoToFeatures}>{localized('Dozens of other features!')}</a>
              </li>
            </ul>
          </div>

          <button className="btn btn-large btn-cta btn-emphasis" onClick={this.onUpgrade}>
            {localized('Upgrade')}
          </button>
        </div>
      </div>
    );
  }
}
