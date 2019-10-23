import { React, PropTypes, AccountStore, SendActionsStore } from 'mailspring-exports';
import { ListensToFluxStore } from 'mailspring-component-kit';
import ConfigSchemaItem from './config-schema-item';

function getDefaultSendAccountSchema(configSchema) {
  const accounts = AccountStore.accounts();
  // const sendActions = SendActionsStore.sendActions()
  const defaultAccountIdForSend = {
    type: 'string',
    title: 'Send new mail from',
    default: 'selected-mailbox',
    enum: ['selected-mailbox'].concat(accounts.map(acc => acc.id)),
    enumLabels: ['Automatically select best account'].concat(
      accounts.map(acc => acc.me().toString())
    ),
  };

  Object.assign(configSchema.properties.sending.properties, {
    defaultAccountIdForSend,
  });
  AppEnv.config.setDefaults('core.sending.defaultAccountIdForSend', 'selected-mailbox');
  return configSchema.properties.sending.properties.defaultAccountIdForSend;
}

function DefaultSendAccount(props) {
  const { config, defaultSendAccount } = props;

  return (
    <ConfigSchemaItem
      config={config}
      configSchema={defaultSendAccount}
      keyPath="core.sending.defaultAccountIdForSend"
    />
  );
}

DefaultSendAccount.displayName = 'DefaultSendAccount';
DefaultSendAccount.propTypes = {
  config: PropTypes.object,
  defaultSendAccount: PropTypes.object,
};

export default ListensToFluxStore(DefaultSendAccount, {
  stores: [AccountStore, SendActionsStore],
  getStateFromStores(props) {
    const { configSchema } = props;
    return {
      defaultSendAccount: getDefaultSendAccountSchema(configSchema),
    };
  },
});
