declare module '@parti/worker-sdk' {
  export function defineRoom<T>(definition: T): T;
}

type PartiClient = {
  playerId: string;
  getState(): any;
  action(name: string, payload?: unknown): Promise<unknown> | void;
  onState(handler: (state: any) => void): void;
  onEvent(handlerName: string, handler: (payload: any) => void): void;
  ready(): void;
  log(...args: unknown[]): void;
};

declare const parti: PartiClient;
