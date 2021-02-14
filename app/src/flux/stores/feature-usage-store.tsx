import Rx from 'rx-lite';
import React from 'react';
import MailspringStore from 'mailspring-store';
import { FeatureUsedUpModal } from 'mailspring-component-kit';
import * as Actions from '../actions';
import { IdentityStore, EMPTY_FEATURE_USAGE, IIdentity } from './identity-store';
import { SendFeatureUsageEventTask } from '../tasks/send-feature-usage-event-task';
import { localized } from '../../intl';

class NoProAccessError extends Error {}

const UsageRecordedServerSide = ['contact-profiles', 'translation'];

export interface FeatureLexicon {
  headerText: string;
  rechargeText: string;
  iconUrl: string;
}

/**
 * FeatureUsageStore is backed by the IdentityStore
 *
 * The billing site is responsible for returning with the Identity object
 * a usage hash that includes all supported features, their quotas for the
 * user, and the current usage of that user. We keep a cache locally
 *
 * The final schema looks like (Feb 7, 2017):
 *
 * MailspringID = {
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
class _FeatureUsageStore extends MailspringStore {
  _waitForModalClose = [];
  NoProAccessError = NoProAccessError;
  _disp: Rx.Disposable;
  _usub: () => void;

  constructor() {
    super();

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

  displayUpgradeModal(feature: string, lexicon: FeatureLexicon) {
    const featureData = this._dataForFeature(feature);
    let { headerText, rechargeText } = lexicon;

    if (!featureData.quota) {
      headerText = localized(`Uhoh - that's a pro feature!`);
    } else {
      headerText = headerText || localized("You've reached your quota");

      const time = featureData.period === 'monthly' ? localized('month') : localized('week');
      rechargeText = rechargeText.replace('%1$@', `${featureData.quota}`).replace('%2$@', time);
    }

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

  isUsable(feature: string) {
    const { usedInPeriod, quota } = this._dataForFeature(feature);
    if (!quota) {
      return true;
    }
    return usedInPeriod < quota;
  }

  async markUsedOrUpgrade(feature: string, lexicon: FeatureLexicon) {
    if (!this.isUsable(feature)) {
      // throws if the user declines
      await this.displayUpgradeModal(feature, lexicon);
    }
    this.markUsed(feature);
  }

  markUsed(feature: string) {
    const next: IIdentity = JSON.parse(JSON.stringify(IdentityStore.identity()));
    if (!next || !next.featureUsage) return;

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

  _dataForFeature(feature: string) {
    const identity = IdentityStore.identity();
    if (!identity) {
      return EMPTY_FEATURE_USAGE;
    }

    const usage = identity.featureUsage || {};
    if (!usage[feature]) {
      AppEnv.reportError(new Error(`Warning: No usage information available for ${feature}`));
      return EMPTY_FEATURE_USAGE;
    }
    return usage[feature];
  }
}

export const FeatureUsageStore = new _FeatureUsageStore();
