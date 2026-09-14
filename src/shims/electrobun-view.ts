type LooseRpc = {
  request: Record<string, (params?: any) => Promise<any>>;
  send: Record<string, (params?: unknown) => void>;
  addMessageListener: (name: string, handler: (data: any) => void) => void;
};

function readBridge(): LooseRpc | undefined {
  const fromWindow = (globalThis as { electrobun?: { rpc?: LooseRpc } }).electrobun;
  return fromWindow?.rpc;
}

export class Electroview {
  rpc?: LooseRpc;

  constructor(options: { rpc: unknown }) {
    this.rpc = readBridge() ?? (options.rpc as LooseRpc);
  }

  static defineRPC(_config: {
    maxRequestTime?: number;
    handlers: {
      requests: object;
      messages: object;
    };
  }): LooseRpc {
    return {
      request: new Proxy(
        {},
        {
          get:
            () =>
            async (_params?: unknown): Promise<unknown> => {
              throw new Error("Electrobun RPC is unavailable outside the desktop shell");
            },
        },
      ) as LooseRpc["request"],
      send: new Proxy(
        {},
        {
          get: () => () => undefined,
        },
      ) as LooseRpc["send"],
      addMessageListener: () => undefined,
    };
  }
}

const Electrobun = { Electroview };

export default Electrobun;
