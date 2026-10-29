/**
 * The one NEAR RPC question the API asks: does this public key belong to this account, with full
 * access? A function-call key can be added by any dapp the user once connected to, so only a
 * full-access key proves the person controls the account.
 */
export type KeyAccess = 'full' | 'limited' | 'missing';

export interface NearRpc {
  accessKey(accountId: string, publicKey: string): Promise<KeyAccess>;
}

export class RpcUnavailable extends Error {}

export function httpNearRpc(url: string, timeoutMs = 5000): NearRpc {
  return {
    async accessKey(accountId, publicKey) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'nyrgo',
            method: 'query',
            params: {
              request_type: 'view_access_key',
              finality: 'final',
              account_id: accountId,
              public_key: publicKey,
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        throw new RpcUnavailable(`NEAR RPC unreachable: ${(e as Error).message}`);
      }
      if (!res.ok) throw new RpcUnavailable(`NEAR RPC answered ${res.status}`);
      const body = (await res.json()) as {
        result?: { permission?: unknown; error?: string };
        error?: { cause?: { name?: string }; name?: string };
      };
      const cause = body.error?.cause?.name;
      // An unknown account or key is an answer, not an outage.
      if (cause === 'UNKNOWN_ACCESS_KEY' || cause === 'UNKNOWN_ACCOUNT') return 'missing';
      if (body.result?.error) return 'missing';
      if (body.error) throw new RpcUnavailable(`NEAR RPC error: ${cause ?? body.error.name}`);
      const permission = body.result?.permission;
      if (permission === 'FullAccess') return 'full';
      return permission ? 'limited' : 'missing';
    },
  };
}
