import Rx from 'rx-lite';
import React from 'react';
import MailspringStore from 'mailspring-store';
import { FeatureUsedUpModal } from 'mailspring-component-kit';
import Actions from '../actions';
import IdentityStore from './identity-store';
import SendFeatureUsageEventTask from '../tasks/send-feature-usage-event-task';

class NoProAccessError extends Error {}

const UsageRecordedServerSide = ['contact-profiles'];

/**
 * FeatureUsageStore is backed by the IdentityStore
 *
 * The billing site is responsible for returning with the Identity object
 * a usage hash that includes all supported features, their quotas for the
 * user, and the current usage of that user. We keep a cache locally
 *
 * The final schema looks like (Feb 7, 2017):
 *
 * NylasID = {
 *   ...
 *   "featureUsage": {
 *     "snooze": {
 *       "quota": 15,
 *       "period": "monthly",
 *       "usedInPeriod": 10,
 *       "featureLimitName": "snooze-experiment-A",
 *     },
 *     "send-later": {
 *       "quota": 99999,
 *       "period": "unlimited",
 *       "usedInPeriod": 228,
 *       "featureLimitName": "send-later-unlimited-A",
 *     },
 *     "reminders": {
 *       "quota": 10,
 *       "period": "daily",
 *       "usedInPeriod": 10,
 *       "featureLimitName": null,
 *     },
 *   },
 *   ...
 * }
 *
 * Valid periods are:
 * 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'unlimited'
 */
class FeatureUsageStore extends MailspringStore {
  constructor() {
    super();
    this._waitForModalClose = [];
    this.NoProAccessError = NoProAccessError;

    /**
     * The IdentityStore triggers both after we update it, and when it
     * polls for new data every several minutes or so.
     */
    this._disp = Rx.Observable.fromStore(IdentityStore).subscribe(() => {
      this.trigger();
    });
    this._usub = Actions.closeModal.listen(this._onModalClose);
  }

  deactivate() {
    this._disp.dispose();
    this._usub();
  }

  displayUpgradeModal(feature, lexicon) {
    const { headerText, rechargeText } = this._modalText(feature, lexicon);

    Actions.openModal({
      height: 575,
      width: 412,
      component: (
        <FeatureUsedUpModal
          modalClass={feature}
          headerText={headerText}
          iconUrl={lexicon.iconUrl}
          rechargeText={rechargeText}
        />
      ),
    });

    return new Promise((resolve, reject) => {
      this._waitForModalClose.push({ resolve, reject, feature });
    });
  }

  isUsable(feature) {
    const { usedInPeriod, quota } = this._dataForFeature(feature);
    if (!quota) {
      return true;
    }
    return usedInPeriod < quota;
  }

  async markUsedOrUpgrade(feature, lexicon = {}) {
    if (!this.isUsable(feature)) {
      // throws if the user declines
      await this.displayUpgradeModal(feature, lexicon);
    }
    this.markUsed(feature);
  }

  markUsed(feature) {
    const next = JSON.parse(JSON.stringify(IdentityStore.identity()));

    if (next.featureUsage[feature]) {
      next.featureUsage[feature].usedInPeriod += 1;
      IdentityStore.saveIdentity(next);
    }
    if (!UsageRecordedServerSide.includes(feature)) {
      Actions.queueTask(new SendFeatureUsageEventTask({ feature }));
    }
  }

  _onModalClose = async () => {
    for (const { feature, resolve, reject } of this._waitForModalClose) {
      if (this.isUsable(feature)) {
        resolve();
      } else {
        reject(new NoProAccessError(feature));
      }
    }
    this._waitForModalClose = [];
  };

  _modalText(feature, lexicon = {}) {
    const featureData = this._dataForFeature(feature);

    let headerText = '';
    let rechargeText = '';
    if (!featureData.quota) {
      headerText = `Uhoh - that's a pro feature!`;
      rechargeText = `Upgrade to Mailspring Pro to ${lexicon.usagePhrase}.`;
    } else {
      headerText = lexicon.usedUpHeader || "You've reached your quota";
      let time = 'later';
      if (featureData.period === 'hourly') {
        time = 'an hour';
      } else if (featureData.period === 'daily') {
        time = 'a day';
      } else if (featureData.period === 'weekly') {
        time = 'a week';
      } else if (featureData.period === 'monthly') {
        time = 'a month';
      } else if (featureData.period === 'yearly') {
        time = 'a year';
      }
      rechargeText = `You can ${lexicon.usagePhrase} ${
        featureData.quota
      } emails ${time} with Mailspring Basic. Upgrade to Pro today!`;
    }
    return { headerText, rechargeText };
  }

  _dataForFeature(feature) {
    const identity = IdentityStore.identity();
    if (!identity) {
      return {};
    }
    const usage = identity.featureUsage || {};
    if (!usage[feature]) {
      AppEnv.reportError(new Error(`Warning: No usage information available for ${feature}`));
      return {};
    }
    return usage[feature];
  }
}

export default new FeatureUsageStore();
