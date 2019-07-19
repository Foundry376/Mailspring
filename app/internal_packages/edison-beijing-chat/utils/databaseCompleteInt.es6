import { iniE2ee } from './e2ee';

export const tableCompletedSync = model => {
  const {
    contacts,
    conversations,
    messages,
    e2ees,
    rooms,
    configs,
    userCache,
    block,
  } = model.sequelize;

  if (model === configs) {
    iniE2ee();
  }
};
