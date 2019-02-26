class ServiceRegistry {
  private _waitingForServices = {};
  private _services = {};

  withService(name: string, callback) {
    if (this._services[name]) {
      setTimeout(() => callback(this._services[name]), 0);
    } else {
      this._waitingForServices[name] = this._waitingForServices[name] || [];
      this._waitingForServices[name].push(callback);
    }
  }

  registerService(name: string, obj) {
    this._services[name] = obj;
    if (this._waitingForServices[name]) {
      for (const callback of this._waitingForServices[name]) {
        callback(obj);
      }
      delete this._waitingForServices[name];
    }
  }

  unregisterService(name: string) {
    delete this._services[name];
  }
}

export default new ServiceRegistry();
