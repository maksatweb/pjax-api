import { Supervisor } from 'spica/supervisor';
import { bind } from 'typed-dom';

export class ScrollView {
  constructor(
    window: Window,
    listener: (event: Event) => void,
  ) {
    let timer = 0;
    void this.sv.register('', () => (
      void this.sv.events.exit.monitor(
        [],
        bind(window, 'scroll', ev => (
          timer = timer > 0
            ? timer
            : setTimeout(() => {
              timer = 0;
              void listener(ev);
            }, 300)
        ), { passive: true })),
      new Promise<never>(() => void 0)
    ), void 0);
    void this.sv.cast('', void 0);
  }
  private readonly sv = new class extends Supervisor<'', void, void, void>{ }();
  public readonly close = (): void =>
    void this.sv.terminate();
}
