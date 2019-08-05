const os = require('os');
const crypto = require('crypto');
const serialNumber = require('serial-number');
let deviceSerial = '';
const getDeviceHash = () => {
  return new Promise(resolve => {
    if (deviceSerial === '') {
      serialNumber((err, value) => {
        if (err) {
          deviceSerial = 'error';
        } else {
          deviceSerial = value;
        }
        resolve(
          crypto
            .createHash('sha256')
            .update(`${os.arch()}-${os.cpus()[0].model}-${deviceSerial}-${os.platform()}`)
            .digest('hex')
        );
      });
    } else {
      resolve(
        crypto
          .createHash('sha256')
          .update(`${os.arch()}-${os.cpus()[0].model}-${deviceSerial}-${os.platform()}`)
          .digest('hex')
      );
    }
    // const networks = os.networkInterfaces();
    // const macs = Object.keys(networks)
    //   .filter(key => {
    //     return (
    //       key.indexOf('en') === 0 || //Predictable Network Interface Device Names
    //       key.indexOf('wl') === 0 || // and traditional wlanx
    //       key.indexOf('ww') === 0 || // and traditional wwanx
    //       key.indexOf('eth') === 0 || // traditional ethx
    //       key.indexOf('em') === 0 || // Embedded network interface (LOM)
    //       (key.indexOf('p') === 0 && !key.includes('_')) //PCI card network interface minus virtual pci
    //     );
    //   })
    //   .map(key => {
    //     return networks[key][0].mac;
    //   })
    //   .join('-');
  });

};
const getOSInfo = () => {
  let cpuModel = os.cpus();
  if(Array.isArray(cpuModel) && cpuModel.length > 0){
    cpuModel = cpuModel[0].model;
  }
  return {
    cpuModel: cpuModel,
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    uptime: os.uptime(),
    freeMemInBytes: os.freemem(),
    totalMemInBytes: os.totalmem(),
    loadAvg: JSON.stringify(os.loadavg()),
  };
};

module.exports = {
  getDeviceHash: getDeviceHash,
  getOSInfo: getOSInfo,
};
