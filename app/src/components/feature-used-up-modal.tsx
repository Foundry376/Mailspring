import React from 'react';
import { shell } from 'electron';
import { localized } from 'mailspring-exports';
import { RetinaImg } from './retina-img';
import { OpenIdentityPageButton } from 'mailspring-component-kit';

export default class FeatureUsedUpModal extends React.Component<{
  modalClass: string;
  iconUrl: string;
  rechargeText: string;
  headerText: string;
}> {
  onGoToFeatures = () => {
    shell.openExternal('https://getmailspring.com/pro');
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

          <OpenIdentityPageButton
            label={localized('Upgrade')}
            path="/payment"
            source="Used Up Modal"
            campaign={this.props.modalClass}
            isCTA={true}
          />
        </div>
      </div>
    );
  }
}
