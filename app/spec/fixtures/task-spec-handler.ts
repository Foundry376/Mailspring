module.exports = function() {
  window.emit('some-event', 1, 2, 3);
  return 'hello';
};
