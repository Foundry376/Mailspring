import React from 'react';
import ReactDOM from 'react-dom';

import { localized, Message, MessageViewExtension, MessageBodyProcessor } from 'mailspring-exports';

import {
  clearTranslationCache,
  getLMStudioSettings,
  translateMessageBody,
  translateText,
  AllLanguages,
} from './service';
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
  RecentlyTranslatedBodies = JSON.parse(window.localStorage.getItem('translated-index-v2') || '[]');
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
    const idx = RecentlyTranslatedBodies.findIndex((o) => o.id === message.id);
    if (idx === -1) return;

    const [result] = RecentlyTranslatedBodies.splice(idx, 1);
    RecentlyTranslatedBodies.push(result);

    if (result.enabled) {
      const translated = window.localStorage.getItem(`translated-${message.id}`);
      if (translated) {
        message.body = translated;
      } else {
        // The cache may have been cleared while this message view was
        // unmounted. Reconcile the in-memory index before rendering the header.
        result.enabled = false;
        window.localStorage.setItem(
          'translated-index-v2',
          JSON.stringify(RecentlyTranslatedBodies)
        );
      }
    }
  };
}

type CldResult = { languages: { language: string }[] };

function callCldViaExtension(text: string, callback: (err, result: CldResult | null) => void) {
  const listener = (message: MessageEvent<any>) => {
    let resp: { response: string; text: string; result: CldResult | null; error: string | null };
    try {
      resp = JSON.parse(message.data);
    } catch (err) {
      return; // probably not a message for us
    }
    if (resp.response === 'detectLanguage' && resp.text === text) {
      window.removeEventListener('message', listener);
      callback(resp.error, resp.result);
    }
  };
  window.addEventListener('message', listener);
  window.postMessage(JSON.stringify({ call: 'detectLanguage', text }), '*');
}

export class TranslateMessageHeader extends React.Component<
  TranslateMessageHeaderProps,
  TranslateMessageHeaderState
> {
  static displayName = 'TranslateMessageHeader';

  _mounted = false;
  _detectionStarted = false;

  state: TranslateMessageHeaderState = {
    detected: null,
    translating: false,
  };

  componentDidMount() {
    this._mounted = true;
    window.addEventListener('mailspring-translation-requested', this._onTranslationRequested);
    window.addEventListener('mailspring-translation-updated', this._onTranslationCacheUpdated);
    this._detectLanguageIfReady();
  }

  componentDidUpdate() {
    this._detectLanguageIfReady();
  }

  componentWillUnmount() {
    this._mounted = false;
    window.removeEventListener('mailspring-translation-requested', this._onTranslationRequested);
    window.removeEventListener('mailspring-translation-updated', this._onTranslationCacheUpdated);
  }

  _onTranslationRequested = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail?.id !== this.props.message.id) return;
    const result = RecentlyTranslatedBodies.find((item) => item.id === detail.id);
    if (result?.enabled) this._onTranslateAgain();
    else this._onTranslateManually();
  };

  _onTranslateManually = () => {
    if (this.state.detected) {
      this._onTranslate('manual');
      return;
    }

    this._detectionStarted = true;
    this.setState({ translating: 'manual' });

    const el = ReactDOM.findDOMNode(this) as Element;
    const messageEl = el && el.closest('.message-item-area');
    const iframeEl = messageEl && messageEl.querySelector('iframe');
    const text = iframeEl?.contentDocument?.body?.innerText?.slice(0, 1000);

    if (!text || text.length < 50) {
      this._onTranslate('manual');
      return;
    }

    let completed = false;
    const finish = (detected?: string) => {
      if (completed || !this._mounted) return;
      completed = true;

      if (detected && AllLanguages[detected]) {
        this.setState({ detected }, () => this._onTranslate('manual'));
      } else {
        this._onTranslate('manual');
      }
    };

    callCldViaExtension(text, (err, result) => {
      if (err || !result || !result.languages?.length) {
        finish();
        return;
      }
      finish(result.languages[0].language);
    });

    // Do not leave the progress banner hanging if the language detector does
    // not respond. Translation can still proceed without a detected source.
    window.setTimeout(() => finish(), 3000);
  };

  _onTranslationCacheUpdated = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail?.cleared || (!detail.all && detail.id !== this.props.message.id)) return;

    if (detail.all) {
      RecentlyTranslatedBodies = RecentlyTranslatedBodies.map((item) => ({
        ...item,
        enabled: false,
      }));
    } else {
      RecentlyTranslatedBodies = RecentlyTranslatedBodies.map((item) =>
        item.id === this.props.message.id ? { ...item, enabled: false } : item
      );
    }
    // Keep the detected language so the normal translation prompt remains
    // available after clearing the saved result.
    this.setState({ translating: false });
    MessageBodyProcessor.updateCacheForMessage(this.props.message);
  };

  _detectLanguageIfReady = async () => {
    if (this._detectionStarted) return;

    // we do not translate messages that YOU sent, because you can probably read them.
    if (this.props.message.isFromMe()) return;

    // load the previous translation result if this message is already translated
    const result = RecentlyTranslatedBodies.find((o) => o.id === this.props.message.id);
    if (result?.fromLang) {
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
    if (!iframeEl || !iframeEl.contentDocument?.body || !this.props.message.body) return;

    let text = iframeEl.contentDocument.body.innerText;
    if (text.length > 1000) text = text.slice(0, 1000);
    if (!text) return;

    if (text.length < 50) {
      // language detection seems unreliably for very short "hello world" emails
      return;
    }

    this._detectionStarted = true;

    callCldViaExtension(text, (err, result) => {
      if (err || !result || !result.languages?.length) {
        console.warn(`Could not detect message language: ${err && err.toString()}`);
        return;
      }
      if (!this._mounted) {
        return;
      }

      // no-op if the current and detected language are the same
      const detected = result.languages[0].language;
      const target = getLMStudioSettings().targetLanguage;
      if (target === detected) return;

      // no-op if we don't know how to translate this language pair
      if (!AllLanguages[target] || !AllLanguages[detected]) return;

      const prefs = getPrefs();
      if (prefs.disabled.includes(detected)) return;
      this.setState({ detected });
      if (prefs.automatic.includes(detected)) {
        this._onTranslate('auto');
      }
    });
  };

  _onTranslate = async (mode: 'auto' | 'manual') => {
    const { message } = this.props;

    const result = RecentlyTranslatedBodies.find((o) => o.id === message.id);
    if (result) {
      if (result.enabled) return;
    }

    this.setState({ translating: mode });
    const targetLanguage = getLMStudioSettings().targetLanguage;
    let translated: string | false = false;
    let translatedSubject = '';
    try {
      // Keep these requests sequential. LM Studio may need to load the model on
      // the first request and some models do not support concurrent context setup.
      translated = await translateMessageBody(message.body, targetLanguage, mode === 'auto');
      if (message.subject) {
        translatedSubject = await translateText(message.subject, targetLanguage);
      }
    } catch (err) {
      if (mode === 'manual') {
        AppEnv.showErrorDialog({
          title: localized('Language Conversion Failed'),
          message: err.toString(),
        });
      }
    }
    if (this._mounted) {
      this.setState({ translating: false });
    }
    if (translated) {
      this._onPersistTranslation(targetLanguage, translated, translatedSubject);
    }
  };

  _onPersistTranslation = (
    targetLanguage: string,
    translated: string,
    translatedSubject: string
  ) => {
    const { message } = this.props;

    if (RecentlyTranslatedBodies.length > 150) {
      const element = RecentlyTranslatedBodies.shift();
      localStorage.removeItem(`translated-${element.id}`);
      localStorage.removeItem(`translated-subject-${element.id}`);
    }

    RecentlyTranslatedBodies = RecentlyTranslatedBodies.filter((item) => item.id !== message.id);
    RecentlyTranslatedBodies.push({
      id: message.id,
      enabled: true,
      fromLang: this.state.detected || '',
      toLang: targetLanguage,
    });
    localStorage.setItem(`translated-${message.id}`, translated);
    if (translatedSubject) {
      localStorage.setItem(`translated-subject-${message.id}`, translatedSubject);
    }
    localStorage.setItem(`translated-index-v2`, JSON.stringify(RecentlyTranslatedBodies));

    window.dispatchEvent(
      new CustomEvent('mailspring-translation-updated', { detail: { id: message.id } })
    );

    MessageBodyProcessor.updateCacheForMessage(message);
  };

  _onToggleTranslate = () => {
    const result = RecentlyTranslatedBodies.find((o) => o.id === this.props.message.id);
    result.enabled = !result.enabled;
    MessageBodyProcessor.updateCacheForMessage(this.props.message);
    window.dispatchEvent(
      new CustomEvent('mailspring-translation-updated', { detail: { id: this.props.message.id } })
    );
  };

  _onTranslateAgain = async () => {
    clearTranslationCache(this.props.message.id);
    MessageBodyProcessor.updateCacheForMessage(this.props.message);
    await Promise.delay(0);
    this._onTranslateManually();
  };

  _onDisableAlwaysForLanguage = () => {
    const prefs = getPrefs();
    prefs.automatic = prefs.automatic.filter((p) => p !== this.state.detected);
    setPrefs(prefs);
    this.forceUpdate();
  };

  _onAlwaysForLanguage = async () => {
    const prefs = getPrefs();
    prefs.disabled = prefs.disabled.filter((p) => p !== this.state.detected);
    prefs.automatic = prefs.automatic.concat([this.state.detected]);
    setPrefs(prefs);

    this.forceUpdate();
    this._onTranslate('manual');
  };

  _onNeverForLanguage = () => {
    if (!this.state.detected) return;

    const response = require('@electron/remote').dialog.showMessageBoxSync({
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
      prefs.automatic = prefs.automatic.filter((p) => p !== this.state.detected);
      setPrefs(prefs);
      this.setState({ detected: null });
    }
  };

  _onReset = () => {
    setPrefs({ automatic: [], disabled: [] });
    this.forceUpdate();
  };

  render() {
    const result = RecentlyTranslatedBodies.find((o) => o.id === this.props.message.id);

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
            <button className="action" tabIndex={0} onClick={this._onToggleTranslate}>
              <span>{localized('Show Original')}</span>
            </button>
            <button className="action" tabIndex={0} onClick={this._onTranslateAgain}>
              <span>{localized('Translate again')}</span>
            </button>
          </div>
        </div>
      );
    }

    const toLanguage = AllLanguages[getLMStudioSettings().targetLanguage];

    const spinner = (
      <RetinaImg
        name="inline-loading-spinner.gif"
        mode={RetinaImg.Mode.ContentDark}
        style={{ width: 14, height: 14, mixBlendMode: 'multiply' }}
      />
    );

    if (this.state.translating) {
      const fromLanguage = this.state.detected && AllLanguages[this.state.detected];
      return (
        <div className="translate-message-header">
          <div className="message">
            <div className="message-centered">
              {fromLanguage
                ? localized('Translating from %1$@ to %2$@.', fromLanguage, toLanguage)
                : localized('Translating to %@.', toLanguage)}
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

    if (!this.state.detected) {
      return <span />;
    }

    const fromLanguage = AllLanguages[this.state.detected];
    const prefs = getPrefs();
    return (
      <div className="translate-message-header">
        <div className="message with-actions">
          <div className="message-centered">
            {localized('Translate from %1$@ to %2$@?', fromLanguage, toLanguage)}
            <div className="note">
              {localized(
                'Privacy note: text below will be sent only to your configured LM Studio server.'
              )}
            </div>
          </div>
        </div>
        <div className="actions">
          <button className="action" tabIndex={0} onClick={this._onTranslateManually}>
            {this.state.translating === 'manual' ? spinner : <span>{localized('Translate')}</span>}
          </button>
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
                        label: localized('Always translate %@', fromLanguage),
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
                itemKey={(item) => item.key}
                itemContent={(item) =>
                  item.label ? item.label : <Menu.Item key={item.key} divider={true} />
                }
                onSelect={(item) => item.select()}
              />
            }
          />
        </div>
      </div>
    );
  }
}
