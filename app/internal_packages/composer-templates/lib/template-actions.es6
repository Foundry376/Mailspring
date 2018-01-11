import Reflux from 'reflux';

const TemplateActions = Reflux.createActions([
  'insertTemplateId',
  'createTemplate',
  'showTemplates',
  'deleteTemplate',
  'renameTemplate',
]);

for (const key of Object.keys(TemplateActions)) {
  TemplateActions[key].sync = true;
}

export default TemplateActions;
