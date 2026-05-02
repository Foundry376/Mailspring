export default function () {
  (window as any).emit('some-event', 1, 2, 3);
  return 'hello';
}
