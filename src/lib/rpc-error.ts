// EIP-1193 compliant RPC error class

export class RpcError extends Error {
  code: number;

  constructor(message: string, code: number) {
    super(message);
    this.code = code;
    this.name = 'RpcError';
  }
}

/** User rejected the request (EIP-1193 §4001) */
export function userRejection(message: string): RpcError {
  return new RpcError(message, 4001);
}
