const os = require('os');
const crypto = require('crypto');

const getDeviceHash = () => {
  const networks = os.networkInterfaces();
  const macs = Object.keys(networks)
    .filter(key => {
      return (
        key.indexOf('en') === 0 || //Predictable Network Interface Device Names
        key.indexOf('wl') === 0 || // and traditional wlanx
        key.indexOf('ww') === 0 || // and traditional wwanx
        key.indexOf('eth') === 0 || // traditional ethx
        key.indexOf('em') === 0 || // Embedded network interface (LOM)
        (key.indexOf('p') === 0 && !key.includes('_')) //PCI card network interface minus virtual pci
      );
    })
    .map(key => {
      return networks[key][0].mac;
    })
    .join('-');
  return crypto
    .createHash('sha256')
    .update(`${os.arch()}-${os.cpus()[0].model}-${macs}-${os.platform()}`)
    .digest('hex');
};

module.exports = {
  getDeviceHash: getDeviceHash,
};
