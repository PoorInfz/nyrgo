/**
 * Prints the arguments for the contract's `register_species`: every creature with its maximum
 * supply by rarity (NFT_SUPPLY_BY_RARITY). Run once after deploying the contract; a species'
 * supply can never change afterwards.
 *
 *   pnpm --filter @nyrgo/api nft:species > species.json
 *   near contract call-function as-transaction <contract> register_species file-args species.json \
 *     prepaid-gas '300 Tgas' attached-deposit '0 NEAR' sign-as <game account> network-config testnet ...
 */
import { CREATURES, NFT_SUPPLY_BY_RARITY } from '@nyrgo/shared';

const species = CREATURES.map((c) => ({
  species: c.id,
  max_supply: NFT_SUPPLY_BY_RARITY[c.rarity],
}));
process.stdout.write(`${JSON.stringify({ species }, null, 2)}\n`);
