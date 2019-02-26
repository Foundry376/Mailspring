const fs = require('fs');
const hash = {};
let sum = 0;
fs
  .readFileSync('results.txt')
  .toString()
  .split('\n')
  .forEach(line => {
    console.log(line);
    const parts = line.split('.ts(');
    if (parts.length > 1) {
      hash[parts[0]] = (hash[parts[0]] || 0) + 1;
      sum += 1;
    }
  });

Object.keys(hash)
  .sort((a, b) => hash[a] - hash[b])
  .forEach(k => console.log(`${hash[k]} ${k}`));

console.log(sum);
