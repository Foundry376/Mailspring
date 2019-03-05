export default class TestDataSource {
  buildObservable() {
    return this;
  }

  onNext: (result: any) => void;

  manuallyTrigger = (messages = []) => {
    this.onNext(messages);
  };

  subscribe(onNext) {
    this.onNext = onNext;
    this.manuallyTrigger();
    const dispose = () => {};
    return { dispose };
  }
}
