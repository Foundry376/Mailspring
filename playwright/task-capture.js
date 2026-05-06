(function() {
  var el = document.createElement('div');
  el.id = '__test-captured-tasks';
  el.style.display = 'none';
  el.setAttribute('data-tasks', '[]');
  document.body.appendChild(el);

  function captureTask(task) {
    var existing = JSON.parse(el.getAttribute('data-tasks') || '[]');
    existing.push({
      __cls: task.constructor.name,
      id: task.id,
      accountId: task.accountId,
      starred: task.starred,
      unread: task.unread,
      threadIds: task.threadIds,
      path: task.path,
      existingPath: task.existingPath,
      folder: task.folder ? { displayName: task.folder.displayName, role: task.folder.role } : undefined,
      labelsToAdd: task.labelsToAdd ? task.labelsToAdd.map(function(l) { return { displayName: l.displayName, role: l.role }; }) : undefined,
      labelsToRemove: task.labelsToRemove ? task.labelsToRemove.map(function(l) { return { displayName: l.displayName, role: l.role }; }) : undefined,
    });
    el.setAttribute('data-tasks', JSON.stringify(existing));
  }

  // Listen to both singular and plural task queueing actions
  window.$m.Actions.queueTask.listen(captureTask);
  window.$m.Actions.queueTasks.listen(function(tasks) {
    if (tasks && tasks.length) {
      tasks.forEach(captureTask);
    }
  });
})();
