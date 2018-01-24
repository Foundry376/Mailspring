module.exports = {
  activate({ someNumber }) {
    this.someNumber = someNumber || 1;
  },

  serialize() {
    return { someNumber: this.someNumber };
  },
};
