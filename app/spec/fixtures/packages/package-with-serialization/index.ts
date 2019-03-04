export function activate({ someNumber }) {
  this.someNumber = someNumber || 1;
}

export function serialize() {
  return { someNumber: this.someNumber };
}
