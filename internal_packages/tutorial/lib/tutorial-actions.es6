import Reflux from 'reflux';

const TutorialActions = Reflux.createActions([
  "dismissedTip",
]);

for (const key of Object.keys(TutorialActions)) {
  TutorialActions[key].sync = true;
}

export default TutorialActions;
