import { React, PropTypes, AccountStore, SendActionsStore } from 'mailspring-exports';
import { ListensToFluxStore } from 'mailspring-component-kit';
import ConfigSchemaItem from './config-schema-item';

function getExtendedSendingSchema(configSchema) {
  const accounts = AccountStore.accounts();
  // const sendActions = SendActionsStore.sendActions()
  const defaultAccountIdForSend = {
    type: 'string',
    title: 'Send new messages from',
    default: 'selected-mailbox',
    enum: ['selected-mailbox'].concat(accounts.map(acc => acc.id)),
    enumLabels: ['Account of selected mailbox'].concat(accounts.map(acc => acc.me().toString())),
  };
  // TODO re-enable sending actions at some point
  // const defaultSendType = {
  //   'type': 'string',
  //   'default': 'send',
  //   'enum': sendActions.map(({configKey}) => configKey),
  //   'enumLabels': sendActions.map(({title}) => title),
  //   'title': "Default send behavior",
  // }

  Object.assign(configSchema.properties.sending.properties, {
    defaultAccountIdForSend,
  });
  AppEnv.config.setDefaults('core.sending.defaultAccountIdForSend', 'selected-mailbox');
  return configSchema.properties.sending;
}

function SendingSection(props) {
  const { config, sendingConfigSchema } = props;

  return (
    <ConfigSchemaItem
      config={config}
      configSchema={sendingConfigSchema}
      keyName="Sending"
      keyPath="core.sending"
    />
  );
}

SendingSection.displayName = 'SendingSection';
SendingSection.propTypes = {
  config: PropTypes.object,
  configSchema: PropTypes.object,
  sendingConfigSchema: PropTypes.object,
};

export default ListensToFluxStore(SendingSection, {
  stores: [AccountStore, SendActionsStore],
  getStateFromStores(props) {
    const { configSchema } = props;
    return {
      sendingConfigSchema: getExtendedSendingSchema(configSchema),
    };
  },
});
