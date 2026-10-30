import { createHash } from 'node:crypto';
import { Account, JsonRpcProvider, KeyPair, actions, type KeyPairString } from 'near-api-js';

/**
 * Puts the creatures NFT contract on NEAR testnet, step by step and safe to run again: each step
 * looks at the chain first and only does what is missing.
 *
 *   1. the contract account `creatures.<game>` is created by the game account, with the game's key
 *   2. the contract is deployed and initialised with the game account as its owner (one transaction)
 *   3. every species is registered with its fixed supply (immutable once registered)
 *
 * The game account is the only key involved. It never leaves the process and is never printed.
 */

export interface SpeciesSupplyArg {
  species: string;
  max_supply: number;
}

/** What the deploy needs from NEAR; the real one is `nearDeployTarget`, tests pass a fake. */
export interface DeployTarget {
  /** Available balance (yocto) and code hash; null if the account does not exist. */
  account(id: string): Promise<{ available: bigint; codeHash: string } | null>;
  createContractAccount(contractId: string, deposit: bigint): Promise<void>;
  /** Deploys `wasm`; with `init`, also calls `new` in the same transaction. */
  deploy(contractId: string, wasm: Uint8Array, init: Record<string, unknown> | null): Promise<void>;
  view<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T>;
  registerSpecies(contractId: string, species: SpeciesSupplyArg[]): Promise<void>;
}

/** Storage for a ~350 kB contract plus the species registry and room for the first tokens. */
export const CONTRACT_DEPOSIT = 5n * 10n ** 24n; // 5 NEAR
const NEAR = 10n ** 24n;
const EMPTY_CODE = '11111111111111111111111111111111';
const BATCH = 25;

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes: Uint8Array): string {
  let n = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/** The code hash NEAR reports for this wasm (base58 sha256). */
export const codeHashOf = (wasm: Uint8Array) => base58(createHash('sha256').update(wasm).digest());

export const near = (yocto: bigint) => `${(Number(yocto / 10n ** 21n) / 1000).toFixed(3)} NEAR`;

export interface DeployOptions {
  game: string;
  contract: string;
  wasm: Uint8Array;
  species: SpeciesSupplyArg[];
  /** Redeploy the code when it differs from what is on chain (state is kept). */
  upgrade?: boolean;
  /** Only look and report; change nothing. */
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface DeployReport {
  created: boolean;
  deployed: 'new' | 'upgraded' | 'unchanged' | 'differs';
  registered: number;
  alreadyRegistered: number;
  /** Species registered on chain with a different supply than the game expects (immutable). */
  mismatched: string[];
}

export async function deployCreatures(t: DeployTarget, o: DeployOptions): Promise<DeployReport> {
  const log = o.log ?? (() => {});
  const would = o.dryRun ? '(dry run) would ' : '';
  if (!o.contract.endsWith(`.${o.game}`)) {
    throw new Error(`The contract account must be a sub-account of ${o.game}`);
  }

  const game = await t.account(o.game);
  if (!game) throw new Error(`The game account ${o.game} does not exist on this network`);
  log(`game account ${o.game}: ${near(game.available)} available`);

  // 1. contract account
  let contract = await t.account(o.contract);
  let created = false;
  if (!contract) {
    if (game.available < CONTRACT_DEPOSIT + NEAR) {
      throw new Error(
        `${o.game} needs at least ${near(CONTRACT_DEPOSIT + NEAR)} to create the contract account; ` +
          'top it up from the testnet faucet',
      );
    }
    log(`${would}create ${o.contract} with ${near(CONTRACT_DEPOSIT)}`);
    if (!o.dryRun) {
      await t.createContractAccount(o.contract, CONTRACT_DEPOSIT);
      contract = await t.account(o.contract);
      if (!contract) throw new Error(`${o.contract} was not created`);
    }
    created = true;
  }

  // 2. code
  const hash = codeHashOf(o.wasm);
  const onChain = contract?.codeHash ?? EMPTY_CODE;
  let deployed: DeployReport['deployed'];
  if (onChain === EMPTY_CODE) {
    log(`${would}deploy and initialise (owner ${o.game}), code ${hash}`);
    if (!o.dryRun) {
      await t.deploy(o.contract, o.wasm, {
        owner_id: o.game,
        metadata: { spec: 'nft-1.0.0', name: 'nyrGo! Creatures (testnet)', symbol: 'NYRGO' },
      });
    }
    deployed = 'new';
  } else if (onChain === hash) {
    log('contract code is up to date');
    deployed = 'unchanged';
  } else if (o.upgrade) {
    log(`${would}upgrade the code ${onChain} → ${hash} (state kept)`);
    if (!o.dryRun) await t.deploy(o.contract, o.wasm, null);
    deployed = 'upgraded';
  } else {
    log(
      `contract code differs from this build (${onChain} on chain); run with upgrade to replace it`,
    );
    deployed = 'differs';
  }

  if (o.dryRun && deployed === 'new') {
    log(`(dry run) would register ${o.species.length} species`);
    return { created, deployed, registered: 0, alreadyRegistered: 0, mismatched: [] };
  }

  // the contract must belong to this game account
  const owner = await t.view<string>(o.contract, 'game_account', {});
  if (owner !== o.game) throw new Error(`${o.contract} is owned by ${owner}, not ${o.game}`);

  // 3. species
  const missing: SpeciesSupplyArg[] = [];
  const mismatched: string[] = [];
  for (const s of o.species) {
    const supply = await t.view<{ minted: number; max: number } | null>(
      o.contract,
      'species_supply',
      { species: s.species },
    );
    if (!supply) missing.push(s);
    else if (supply.max !== s.max_supply)
      mismatched.push(`${s.species} (${supply.max} ≠ ${s.max_supply})`);
  }
  log(
    `${o.species.length - missing.length} species already registered, ${missing.length} to register`,
  );
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    log(`${would}register ${batch.map((s) => `${s.species}=${s.max_supply}`).join(', ')}`);
    if (!o.dryRun) await t.registerSpecies(o.contract, batch);
  }
  if (mismatched.length) log(`WARNING: supply differs on chain for ${mismatched.join(', ')}`);

  return {
    created,
    deployed,
    registered: o.dryRun ? 0 : missing.length,
    alreadyRegistered: o.species.length - missing.length,
    mismatched,
  };
}

const notFound = (e: unknown) =>
  /does not exist|doesn't exist|UNKNOWN_ACCOUNT|AccountDoesNotExist/i.test(
    String((e as Error)?.message ?? e),
  );

/** The real target: signs with the game account's key (`ed25519:…`). */
export function nearDeployTarget(rpcUrl: string, game: string, key: string): DeployTarget {
  const provider = new JsonRpcProvider({ url: rpcUrl });
  const keyPair = KeyPair.fromString(key as KeyPairString);
  const gameAccount = new Account(game, provider, key as KeyPairString);
  // the contract account is created with the game's key, so the same key signs for it
  const as = (id: string) => new Account(id, provider, key as KeyPairString);
  return {
    async account(id) {
      try {
        const s = await new Account(id, provider).getState();
        return { available: s.balance.available, codeHash: s.codeHash };
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
    async createContractAccount(contractId, deposit) {
      await gameAccount.createAccount({
        newAccountId: contractId,
        publicKey: keyPair.getPublicKey(),
        nearToTransfer: deposit,
      });
    },
    async deploy(contractId, wasm, init) {
      const list = [actions.deployContract(wasm)];
      if (init) list.push(actions.functionCall('new', init, 100_000_000_000_000n, 0n));
      await as(contractId).signAndSendTransaction({ receiverId: contractId, actions: list });
    },
    async view<T>(contractId: string, method: string, args: Record<string, unknown>) {
      return (await provider.callFunction({ contractId, method, args })) as T;
    },
    async registerSpecies(contractId, species) {
      await gameAccount.callFunctionRaw({
        contractId,
        methodName: 'register_species',
        args: { species },
        gas: 300_000_000_000_000n,
        deposit: 0n,
      });
    },
  };
}
