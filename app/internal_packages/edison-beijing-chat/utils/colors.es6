const colors = [
  '#ff5939',
  '#ff8d09',
  '#4ee3ca',
  '#16c8fd',
  '#e94cc0',
  '#b647f6'
];

const colorsStop = [
  '#ff2d60',
  '#ff5e3a',
  '#54c4f6',
  '#1966f2',
  '#c643fc',
  '#5856d6'
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

export const gradientColorForString = str => {
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
  const colorIdx = Math.abs(hash % colors.length);
  const startColor = colors[colorIdx];
  const stopColor = colorsStop[colorIdx];
  return `linear-gradient(${startColor}, ${stopColor})`
};

export const theme = {
  primaryColor: '#0097FF',
};
