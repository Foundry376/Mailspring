class TrackingAppEvents {
  static trackingTasks = [
    'ChangeUnreadTask',
    'ChangeStarredTask',
    'ChangeFolderTask',
    'ChangeLabelsTask',
    'DeleteThreadsTask',
    // 'SyncbackDraftTask',
    'DestroyDraftTask',
    'SendDraftTask',
    // 'SyncbackCategoryTask',
    'DestroyCategoryTask',
    'ExpungeAllInFolderTask',
    'GetMessageRFC2822Task',
    'UndoTask',
    'ChangeRoleMappingTask',
    // 'AnalyzeDBTask',
    'CalendarTask',
    'ExpungeMessagesTask',
    'ChangeDraftToFailingTask',
    'CancelOutboxDraftTask',
  ];
  static sourceMap = {
    'Toolbar Button: Thread List': task => {
      return task.folder && task.folder.role ? `-${task.folder.role}` : '';
    },
    Swipe: () => '-Swipe',
    'Important Icon': () => '-ImportantIcon',
  };

  static onQueueTask(task) {
    const taskName = task.constructor.name;
    if (!taskName || !this.trackingTasks.includes(taskName)) {
      return;
    }
    let eventName = taskName.replace(/Task$/g, '');
    const source = task.source;
    const dealFuncName = this.sourceMap[source];
    if (dealFuncName && dealFuncName && typeof dealFuncName === 'function') {
      eventName = `${eventName}${dealFuncName(task)}`;
    }
    const params = {
      source: task.source,
    };
    FB.AppEvents.logEvent(eventName, null, params);
  }

  static trackingEvent(eventName, params) {
    FB.AppEvents.logEvent(eventName, null, params);
  }
}

export default {
  trackingEvent: TrackingAppEvents.trackingEvent,
  trackingTask: task => TrackingAppEvents.onQueueTask(task),
};
