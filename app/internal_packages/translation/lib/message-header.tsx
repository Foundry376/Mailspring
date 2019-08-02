import React from 'react';
import ReactDOM from 'react-dom';
import cld from '@paulcbetts/cld';
import { remote } from 'electron';
import {
  localized,
  Message,
  MessageViewExtension,
  getCurrentLocale,
  MessageBodyProcessor,
  IdentityStore,
  FeatureUsageStore,
} from 'mailspring-exports';

import { translateMessageBody, AllLanguages, TranslationsUsedLexicon } from './service';
import { Menu, ButtonDropdown, RetinaImg } from 'mailspring-component-kit';

interface TranslateMessageHeaderProps {
  message: Message;
}

interface TranslateMessageHeaderState {
  detected: string | null;
  translating: 'manual' | 'auto' | false;
}

let RecentlyTranslatedBodies: {
  id: string;
  enabled: boolean;
  fromLang: string;
  toLang: string;
}[] = [];

try {
  RecentlyTranslatedBodies = JSON.parse(window.localStorage.getItem('translated-index') || '[]');
} catch (err) {
  // no saved translations
}

function getPrefs() {
  return {
    disabled: AppEnv.config.get('core.translation.disabled') || [],
    automatic: AppEnv.config.get('core.translation.automatic') || [],
  };
}

function setPrefs(opts: { disabled: string[]; automatic: string[] }) {
  AppEnv.config.set('core.translation.disabled', opts.disabled);
  AppEnv.config.set('core.translation.automatic', opts.automatic);
}

export class TranslateMessageExtension extends MessageViewExtension {
  static formatMessageBody = ({ message }) => {
    // retrieve from cache and push to the end to ensure the least recently viewed message is
    // removed from the cache first.
    const idx = RecentlyTranslatedBodies.findIndex(o => o.id === message.id);
    if (idx === -1) return;

    const [result] = RecentlyTranslatedBodies.splice(idx, 1);
    RecentlyTranslatedBodies.push(result);

    if (result.enabled) {
      message.body = window.localStorage.getItem(`translated-${message.id}`);
    }
  };
}

export class TranslateMessageHeader extends React.Component<
  TranslateMessageHeaderProps,
  TranslateMessageHeaderState
> {
  static displayName = 'TranslateMessageHeader';

  _mounted: boolean = false;
  _detectionStarted: boolean = false;

  state: TranslateMessageHeaderState = {
    detected: null,
    translating: false,
  };

  componentDidMount() {
    this._mounted = true;
    this._detectLanguageIfReady();
  }

  componentDidUpdate() {
    this._detectLanguageIfReady();
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  _detectLanguageIfReady = async () => {
    if (this._detectionStarted) return;

    // we do not translate messages that YOU sent, because you can probably read them.
    if (this.props.message.isFromMe()) return;

    // load the previous translation result if this message is already translated
    const result = RecentlyTranslatedBodies.find(o => o.id === this.props.message.id);
    if (result) {
      this._detectionStarted = true;
      this.setState({ detected: result.fromLang });
      return;
    }

    // add a delay to avoid this work if the user is rapidly flipping through messages
    await Promise.delay(1000);

    if (this._detectionStarted || !this._mounted) return;

    // we need to trim the quoted text, convert the HTML to plain text to analyze, etc.
    // the second step is costly and we can just wait for the message to mount and read
    // the innerText which is much more efficient.
    const el = ReactDOM.findDOMNode(this) as Element;
    const messageEl = el && el.closest('.message-item-area');
    const iframeEl = messageEl && messageEl.querySelector('iframe');
    if (!iframeEl || !this.props.message.body) return;

    let text = iframeEl.contentDocument.body.innerText;
    if (text.length > 1000) text = text.slice(0, 1000);
    if (!text) return;

    this._detectionStarted = true;

    cld.detect(text, (err, result) => {
      if (err || !result || !result.languages.length) {
        console.warn(`Could not detect message language: ${err.toString()}`);
        return;
      }
      const detected = result.languages[0].code;
      const current = getCurrentLocale().split('-')[0];

      // no-op if the current and detected language are the same
      if (current === detected) return;

      // no-op if we don't know what either of the language codes are
      if (!AllLanguages[current] || !AllLanguages[detected]) return;

      const prefs = getPrefs();
      if (prefs.disabled.includes(detected)) return;
      this.setState({ detected });
      if (prefs.automatic.includes(detected) && IdentityStore.hasProFeatures()) {
        this._onTranslate('auto');
      }
    });
  };

  _onTranslate = async (mode: 'auto' | 'manual') => {
    const { message } = this.props;

    const result = RecentlyTranslatedBodies.find(o => o.id === message.id);
    if (result) {
      if (!result.enabled) this._onToggleTranslate();
      return;
    }

    if (!IdentityStore.hasProFeatures()) {
      try {
        await FeatureUsageStore.markUsedOrUpgrade('translation', TranslationsUsedLexicon);
      } catch (err) {
        // user does not have access to this feature
        return;
      }
    }

    this.setState({ translating: mode });
    const targetLanguage = getCurrentLocale().split('-')[0];
    const translated = await translateMessageBody(message.body, targetLanguage, mode === 'auto');
    if (this._mounted) {
      this.setState({ translating: false });
    }
    if (translated) {
      this._onPersistTranslation(targetLanguage, translated);
    }
  };

  _onPersistTranslation = (targetLanguage: string, translated: string) => {
    const { message } = this.props;

    if (RecentlyTranslatedBodies.length > 150) {
      const element = RecentlyTranslatedBodies.shift();
      localStorage.removeItem(`translated-${element.id}`);
    }

    RecentlyTranslatedBodies.push({
      id: message.id,
      enabled: true,
      fromLang: this.state.detected,
      toLang: targetLanguage,
    });
    localStorage.setItem(`translated-${message.id}`, translated);
    localStorage.setItem(`translated-index`, JSON.stringify(RecentlyTranslatedBodies));

    MessageBodyProcessor.updateCacheForMessage(message);
  };

  _onToggleTranslate = () => {
    const result = RecentlyTranslatedBodies.find(o => o.id === this.props.message.id);
    result.enabled = !result.enabled;
    MessageBodyProcessor.updateCacheForMessage(this.props.message);
  };

  _onDisableAlwaysForLanguage = () => {
    const prefs = getPrefs();
    prefs.automatic = prefs.automatic.filter(p => p !== this.state.detected);
    setPrefs(prefs);
    this.forceUpdate();
  };

  _onAlwaysForLanguage = async () => {
    if (!IdentityStore.hasProFeatures()) {
      try {
        await FeatureUsageStore.displayUpgradeModal('translation', {
          headerText: localized('Translate automatically with Mailspring Pro'),
          rechargeText: `${localized(
            "Unfortunately, translation services bill per character and we can't offer this feature for free."
          )} ${localized('Upgrade to Pro today!')}`,
          iconUrl: 'mailspring://translation/assets/ic-translation-modal@2x.png',
        });
      } catch (err) {
        return;
      }
    }

    const prefs = getPrefs();
    prefs.disabled = prefs.disabled.filter(p => p !== this.state.detected);
    prefs.automatic = prefs.automatic.concat([this.state.detected]);
    setPrefs(prefs);

    this.forceUpdate();
    this._onTranslate('manual');
  };

  _onNeverForLanguage = () => {
    if (!this.state.detected) return;

    const response = remote.dialog.showMessageBox(remote.getCurrentWindow(), {
      type: 'warning',
      buttons: [localized('Yes'), localized('Cancel')],
      message: localized('Are you sure?'),
      detail: localized(
        'Mailspring will no longer offer to translate messages written in %@.',
        AllLanguages[this.state.detected]
      ),
    });
    if (response === 0) {
      const prefs = getPrefs();
      prefs.disabled = prefs.disabled.concat([this.state.detected]);
      prefs.automatic = prefs.automatic.filter(p => p !== this.state.detected);
      setPrefs(prefs);
      this.setState({ detected: null });
    }
  };

  _onReset = () => {
    setPrefs({ automatic: [], disabled: [] });
    this.forceUpdate();
  };

  render() {
    const result = RecentlyTranslatedBodies.find(o => o.id === this.props.message.id);

    if (result && result.enabled) {
      return (
        <div className="translate-message-header">
          <div className="message with-actions">
            <div className="message-centered">
              {localized(
                'Mailspring has translated this message into %@.',
                AllLanguages[result.toLang]
              )}
            </div>
          </div>
          <div className="actions">
            <div className="action" tabIndex={-1} onClick={this._onToggleTranslate}>
              <span>{localized('Show Original')}</span>
            </div>
          </div>
        </div>
      );
    }

    if (!this.state.detected) {
      return <span />;
    }

    const fromLanguage = AllLanguages[this.state.detected];
    const toLanguage = AllLanguages[getCurrentLocale().split('-')[0]];
    const prefs = getPrefs();

    const spinner = (
      <RetinaImg
        name="inline-loading-spinner.gif"
        mode={RetinaImg.Mode.ContentDark}
        style={{ width: 14, height: 14, mixBlendMode: 'multiply' }}
      />
    );

    if (this.state.translating === 'auto') {
      return (
        <div className="translate-message-header">
          <div className="message">
            <div className="message-centered">
              {localized('Translating from %1$@ to %2$@.', fromLanguage, toLanguage)}
            </div>
            <div style={{ flex: 1 }} />
            <RetinaImg
              name="inline-loading-spinner.gif"
              mode={RetinaImg.Mode.ContentDark}
              style={{ width: 14, height: 14, mixBlendMode: 'multiply' }}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="translate-message-header">
        <div className="message with-actions">
          <div className="message-centered">
            {localized('Translate from %1$@ to %2$@?', fromLanguage, toLanguage)}
            <div className="note">
              {localized('Privacy note: text below will be sent to an online translation service.')}
            </div>
          </div>
        </div>
        <div className="actions">
          <div className="action" tabIndex={-1} onClick={() => this._onTranslate('manual')}>
            {this.state.translating === 'manual' ? spinner : <span>{localized('Translate')}</span>}
          </div>
          <ButtonDropdown
            bordered={false}
            attachment="right"
            closeOnMenuClick={true}
            primaryItem={<span>{localized('Options')}</span>}
            className="action"
            menu={
              <Menu
                items={[
                  prefs.automatic.includes(this.state.detected)
                    ? {
                        key: 'always',
                        label: localized('Stop translating %@', fromLanguage),
                        select: this._onDisableAlwaysForLanguage,
                      }
                    : {
                        key: 'always',
                        label: localized('Always translate %@', fromLanguage) + ` (Pro)`,
                        select: this._onAlwaysForLanguage,
                      },
                  {
                    key: 'never',
                    label: localized('Never translate %@', fromLanguage),
                    select: this._onNeverForLanguage,
                  },
                  { key: 'divider' },
                  {
                    key: 'reset',
                    label: localized('Reset translation settings'),
                    select: this._onReset,
                  },
                ]}
                itemKey={item => item.key}
                itemContent={item =>
                  item.label ? item.label : <Menu.Item key={item.key} divider={true} />
                }
                onSelect={item => item.select()}
              />
            }
          />
        </div>
      </div>
    );
  }
}
