const colors = [
  '#3369e7',
  '#8e43e7',
  '#b84592',
  '#ff4f81',
  '#ff6c5f',
  '#ffc168',
  '#2dde98',
  '#1cc7d0',
];

export const colorForString = str => {
  const trimmedString = str.trim();
  let hash = 0;
  let i = 0;
  const len = trimmedString.length;
  while (i < len) {
    /* eslint-disable no-bitwise */
    hash = (((hash << 5) - hash) + trimmedString.charCodeAt(i)) << 0;
    /* eslint-enable no-bitwise */
    i += 1;
  }
  return colors[Math.abs(hash % colors.length)];
};

export const theme = {
  primaryColor: '#0097FF',
};
