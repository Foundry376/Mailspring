import React from 'react';
import PropTypes from 'prop-types';
import { localized, getAvailableLanguages } from 'mailspring-exports';

const LanguageSection = ({ config }) => {
  const { automatic, current, verified, experimental } = getAvailableLanguages();

  const configValue = config.get('core.intl.language');
  const relaunchRequiredToSet = configValue && current.key !== configValue;
  const relaunchRequiredToUnset = !configValue && current.key !== automatic.key;
  const relaunchRequired = relaunchRequiredToSet || relaunchRequiredToUnset;

  const onChangeValue = event => {
    config.set('core.intl.language', event.target.value);
    event.target.blur();
  };

  return (
    <section>
      <h6>{localized('Interface Language')}</h6>

      <div className="item">
        <select
          onChange={onChangeValue}
          value={configValue}
          style={{ marginLeft: 0, marginRight: 0 }}
        >
          <option key="auto" value="">
            {localized('Automatic')} ({automatic.name})
          </option>
          <option key="sep1" disabled />
          <option key="subtitle1" disabled>
            {localized('Contributed:')}
          </option>
          {verified.map(({ key, name }) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
          <option key="sep2" disabled />
          <option key="subtitle2" disabled>
            {localized('Experimental:')}
          </option>
          {experimental.map(({ key, name }) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
        {relaunchRequired && (
          <div
            className="btn btn-small"
            style={{ marginLeft: 9, marginRight: 9 }}
            onClick={() => {
              require('electron').remote.app.relaunch();
              require('electron').remote.app.quit();
            }}
          >
            {localized('Relaunch')}
          </div>
        )}
      </div>
    </section>
  );
};

LanguageSection.propTypes = {
  config: PropTypes.object,
  configSchema: PropTypes.object,
};

export default LanguageSection;
