//! nyrGo! creatures as NFTs (NEP-171 core, NEP-177 metadata, NEP-178 approvals, NEP-181
//! enumeration), built on NEAR's own `near-contract-standards`.
//!
//! The NFT *is* the creature: whoever owns the token owns the creature in the game. Only the game
//! account (`owner_id`) can mint, and it pays the storage of every token it mints. Everything else
//! (transfers, approvals for marketplaces, enumeration) is the standard implementation, unchanged.
//!
//! Scarcity is on chain: each species is registered once with its maximum supply (more for
//! common species, fewer for epic ones), which can never change afterwards. Every mint takes the
//! next edition number and the title says so ("Gwisp #12/1000"); once all editions exist the
//! species is sold out, for the game too. Testnet only until the Phase 6 gates.
//!
//! Trading pays the players' rewards: resales on outside marketplaces pay a royalty (NEP-199
//! payouts) and sales in the game's own market (`market_*`, here in the contract, so a sale is
//! one atomic call) pay a fee. Both go to the treasury account, which funds the NEAR tips players
//! earn by walking to creatures and catching them.

use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::collections::{LazyOption, LookupMap, UnorderedMap};
use near_sdk::json_types::U128;
use near_sdk::{
    assert_one_yocto, env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault,
    Promise, PromiseOrValue,
};
use std::collections::HashMap;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    NonFungibleToken,
    Metadata,
    TokenMetadata,
    Enumeration,
    Approval,
    Species,
    Listings,
}

/// Where trading fees go, and how much. Basis points: 500 = 5 %.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct MarketConfig {
    pub treasury: AccountId,
    /// Paid to the treasury on resales through outside marketplaces (NEP-199).
    pub royalty_bps: u16,
    /// Paid to the treasury on sales in the game's market.
    pub market_fee_bps: u16,
}

/// A creature for sale in the game's market. The deposit pays the listing's storage and goes
/// back to the seller when the listing ends.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Listing {
    pub seller: AccountId,
    pub price: U128,
    pub deposit: U128,
}

#[near(serializers = [json])]
pub struct ListingView {
    pub token_id: TokenId,
    pub seller: AccountId,
    pub price: U128,
}

/// NEP-199: who gets what of a sale.
#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub struct Payout {
    pub payout: HashMap<AccountId, U128>,
}

/// Fees are capped so a misconfiguration can never take most of a sale.
const MAX_BPS: u16 = 2_000;
/// Smallest price in the game's market (0.01 NEAR).
const MIN_PRICE: u128 = 10_000_000_000_000_000_000_000;
/// Held while a creature is listed (0.01 NEAR), returned when the listing ends.
const LISTING_DEPOSIT: u128 = 10_000_000_000_000_000_000_000;

/** How many of a species exist and can ever exist. */
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Supply {
    pub minted: u32,
    pub max: u32,
}

#[near(serializers = [json])]
pub struct SpeciesSupply {
    pub species: String,
    pub max_supply: u32,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    species: LookupMap<String, Supply>,
    market: MarketConfig,
    listings: UnorderedMap<TokenId, Listing>,
}

/// The state before trading existed (first testnet deploy), for `migrate`.
#[near(serializers = [borsh])]
pub struct ContractV1 {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    species: LookupMap<String, Supply>,
}

fn check_market(m: &MarketConfig) {
    require!(
        m.royalty_bps <= MAX_BPS && m.market_fee_bps <= MAX_BPS,
        "Fees are capped at 20 %"
    );
}

fn bps(amount: u128, bps: u16) -> u128 {
    amount * bps as u128 / 10_000
}

#[near]
impl Contract {
    /// `owner_id` is the game account: the only one allowed to mint. Without `market`, fees go
    /// to the game account: 5 % royalty, 5 % market fee.
    #[init]
    pub fn new(
        owner_id: AccountId,
        metadata: NFTContractMetadata,
        market: Option<MarketConfig>,
    ) -> Self {
        require!(!env::state_exists(), "Already initialized");
        metadata.assert_valid();
        require!(metadata.spec == NFT_METADATA_SPEC, "Wrong metadata spec");
        let market = market.unwrap_or(MarketConfig {
            treasury: owner_id.clone(),
            royalty_bps: 500,
            market_fee_bps: 500,
        });
        check_market(&market);
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::NonFungibleToken,
                owner_id,
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            species: LookupMap::new(StorageKey::Species),
            market,
            listings: UnorderedMap::new(StorageKey::Listings),
        }
    }

    /// Upgrades the first deploy's state (no market) in place: tokens, editions and species stay.
    /// Called by the contract itself right after the new code is deployed.
    #[private]
    #[init(ignore_state)]
    pub fn migrate(market: MarketConfig) -> Self {
        check_market(&market);
        let old: ContractV1 = env::state_read().unwrap_or_else(|| env::panic_str("No state"));
        Self {
            tokens: old.tokens,
            metadata: old.metadata,
            species: old.species,
            market,
            listings: UnorderedMap::new(StorageKey::Listings),
        }
    }

    /// Changes where fees go or their size (capped at 20 %). Game account only.
    pub fn set_market(&mut self, market: MarketConfig) {
        self.assert_game();
        check_market(&market);
        self.market = market;
    }

    pub fn market_config(&self) -> MarketConfig {
        self.market.clone()
    }

    // ------------------------------------------------------------------ the game's market

    /// Puts one of your creatures up for sale at `price` (yoctoNEAR). Attach the listing deposit
    /// (0.01 NEAR); it comes back when the listing ends. Listing again changes the price.
    #[payable]
    pub fn market_list(&mut self, token_id: TokenId, price: U128) {
        let seller = env::predecessor_account_id();
        let owner = self.owner_of(&token_id);
        require!(owner == seller, "Only the owner can sell this creature");
        require!(price.0 >= MIN_PRICE, "The price must be at least 0.01 NEAR");
        let deposit = match self.listings.get(&token_id) {
            Some(l) if l.seller == seller => {
                assert_one_yocto();
                l.deposit
            }
            _ => {
                require!(
                    env::attached_deposit().as_yoctonear() >= LISTING_DEPOSIT,
                    "Attach 0.01 NEAR for the listing"
                );
                env::attached_deposit().as_yoctonear().into()
            }
        };
        self.listings.insert(
            &token_id,
            &Listing {
                seller,
                price,
                deposit,
            },
        );
    }

    /// Takes a creature off sale. The seller, or anyone once the seller no longer owns it.
    #[payable]
    pub fn market_unlist(&mut self, token_id: TokenId) {
        assert_one_yocto();
        let l = self
            .listings
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Not for sale"));
        let caller = env::predecessor_account_id();
        require!(
            caller == l.seller || self.owner_of(&token_id) != l.seller,
            "Only the seller can take it off sale"
        );
        self.end_listing(&token_id);
    }

    /// Buys a listed creature: attach its price. The seller gets the price minus the market fee
    /// (and their listing deposit back); the fee goes to the treasury. One atomic call.
    #[payable]
    pub fn market_buy(&mut self, token_id: TokenId) -> Token {
        let l = self
            .listings
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Not for sale"));
        let buyer = env::predecessor_account_id();
        require!(buyer != l.seller, "You already own it");
        let paid = env::attached_deposit().as_yoctonear();
        require!(paid >= l.price.0, "Attach the full price");
        require!(
            self.owner_of(&token_id) == l.seller,
            "The seller no longer owns it"
        );

        self.listings.remove(&token_id);
        self.tokens.internal_transfer(
            &l.seller,
            &buyer,
            &token_id,
            None,
            Some("nyrGo! market".into()),
        );

        let fee = bps(l.price.0, self.market.market_fee_bps);
        let to_seller = l.price.0 - fee + l.deposit.0;
        Promise::new(l.seller.clone())
            .transfer(NearToken::from_yoctonear(to_seller))
            .detach();
        if fee > 0 {
            Promise::new(self.market.treasury.clone())
                .transfer(NearToken::from_yoctonear(fee))
                .detach();
        }
        if paid > l.price.0 {
            Promise::new(buyer)
                .transfer(NearToken::from_yoctonear(paid - l.price.0))
                .detach();
        }
        self.tokens.nft_token(token_id).unwrap()
    }

    pub fn market_listing(&self, token_id: TokenId) -> Option<ListingView> {
        self.listings.get(&token_id).map(|l| ListingView {
            token_id,
            seller: l.seller,
            price: l.price,
        })
    }

    pub fn market_listings(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<ListingView> {
        self.listings
            .iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .map(|(token_id, l)| ListingView {
                token_id,
                seller: l.seller,
                price: l.price,
            })
            .collect()
    }

    pub fn market_count(&self) -> u64 {
        self.listings.len()
    }

    fn owner_of(&self, token_id: &TokenId) -> AccountId {
        self.tokens
            .owner_by_id
            .get(token_id)
            .unwrap_or_else(|| env::panic_str("Token not found"))
    }

    /// Ends a listing (if any) and returns its deposit to the seller.
    fn end_listing(&mut self, token_id: &TokenId) {
        if let Some(l) = self.listings.remove(token_id) {
            if l.deposit.0 > 0 {
                Promise::new(l.seller)
                    .transfer(NearToken::from_yoctonear(l.deposit.0))
                    .detach();
            }
        }
    }

    // ------------------------------------------------------------------ NEP-199 royalties

    /// What each account gets when this creature sells for `balance` elsewhere.
    pub fn nft_payout(
        &self,
        token_id: TokenId,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Payout {
        let owner = self.owner_of(&token_id);
        self.payout_for(owner, balance.0, max_len_payout)
    }

    /// Transfers like `nft_transfer` (for an approved marketplace) and says how to split the sale.
    #[payable]
    pub fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Payout {
        assert_one_yocto();
        self.end_listing(&token_id);
        let sender = env::predecessor_account_id();
        let (owner, _) =
            self.tokens
                .internal_transfer(&sender, &receiver_id, &token_id, approval_id, memo);
        self.payout_for(owner, balance.0, max_len_payout)
    }

    fn payout_for(&self, owner: AccountId, balance: u128, max_len_payout: Option<u32>) -> Payout {
        if let Some(max) = max_len_payout {
            require!(max >= 2, "Two accounts share a sale: owner and treasury");
        }
        let royalty = bps(balance, self.market.royalty_bps);
        let mut payout = HashMap::new();
        if royalty > 0 && owner != self.market.treasury {
            payout.insert(self.market.treasury.clone(), U128(royalty));
            payout.insert(owner, U128(balance - royalty));
        } else {
            payout.insert(owner, U128(balance));
        }
        Payout { payout }
    }

    fn assert_game(&self) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only the game account can do this"
        );
    }

    /// Registers species with their maximum supply. Game account only; a species' supply is
    /// fixed forever once registered.
    pub fn register_species(&mut self, species: Vec<SpeciesSupply>) {
        self.assert_game();
        for s in species {
            require!(
                !s.species.is_empty() && s.species.len() <= 32,
                "Species ids are 1-32 characters"
            );
            require!(s.max_supply > 0, "A species needs a supply above zero");
            require!(
                self.species.get(&s.species).is_none(),
                "A species' supply is fixed once registered"
            );
            self.species.insert(
                &s.species,
                &Supply {
                    minted: 0,
                    max: s.max_supply,
                },
            );
        }
    }

    /// How many of a species exist and can exist; null if it is not registered.
    pub fn species_supply(&self, species: String) -> Option<Supply> {
        self.species.get(&species)
    }

    /// Mints one creature of a registered species to a player's account, as the next edition.
    /// Game account only; the attached deposit pays the token's storage, the rest is refunded.
    #[payable]
    pub fn nft_mint(
        &mut self,
        token_id: TokenId,
        token_owner_id: AccountId,
        species: String,
        mut token_metadata: TokenMetadata,
    ) -> Token {
        self.assert_game();
        require!(
            token_id.len() <= 64 && !token_id.is_empty(),
            "Token ids are 1-64 characters"
        );
        let mut supply = self
            .species
            .get(&species)
            .unwrap_or_else(|| env::panic_str("Unknown species"));
        require!(
            supply.minted < supply.max,
            "Sold out: every edition of this species exists"
        );
        supply.minted += 1;
        self.species.insert(&species, &supply);
        let title = token_metadata.title.unwrap_or_else(|| species.clone());
        token_metadata.title = Some(format!("{} #{}/{}", title, supply.minted, supply.max));
        token_metadata.copies = Some(supply.max as u64);
        self.tokens
            .internal_mint(token_id, token_owner_id, Some(token_metadata))
    }

    /// The game account (for players and explorers checking who mints).
    pub fn game_account(&self) -> AccountId {
        self.tokens.owner_id.clone()
    }
}

#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.end_listing(&token_id);
        self.tokens
            .nft_transfer(receiver_id, token_id, approval_id, memo);
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.end_listing(&token_id);
        self.tokens
            .nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.tokens.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id,
            approved_account_ids,
        )
    }
}

#[near]
impl NonFungibleTokenApproval for Contract {
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        self.tokens.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id);
    }

    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(token_id);
    }

    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.tokens
            .nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens
            .nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, NearToken};

    const MINT_DEPOSIT: NearToken = NearToken::from_millinear(100);

    fn contract_metadata() -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "nyrGo! Creatures (testnet)".to_string(),
            symbol: "NYRGO".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }

    fn creature(title: &str) -> TokenMetadata {
        TokenMetadata {
            title: Some(title.to_string()),
            description: None,
            media: Some("https://example.test/creatures/gwisp.webp".to_string()),
            media_hash: None,
            copies: Some(1),
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(r#"{"species":"gwisp","level":5}"#.to_string()),
            reference: None,
            reference_hash: None,
        }
    }

    /// accounts(0) = game account, accounts(1) and (2) = players. Gwisp: 1000, a test epic: 2.
    fn setup() -> (VMContextBuilder, Contract) {
        let mut ctx = VMContextBuilder::new();
        ctx.current_account_id(accounts(3))
            .predecessor_account_id(accounts(0));
        testing_env!(ctx.build());
        let mut c = Contract::new(
            accounts(0),
            contract_metadata(),
            Some(MarketConfig {
                treasury: accounts(4),
                royalty_bps: 500,
                market_fee_bps: 500,
            }),
        );
        c.register_species(vec![
            SpeciesSupply {
                species: "gwisp".into(),
                max_supply: 1000,
            },
            SpeciesSupply {
                species: "rugpullor".into(),
                max_supply: 2,
            },
        ]);
        (ctx, c)
    }

    fn mint_species(
        ctx: &mut VMContextBuilder,
        c: &mut Contract,
        who: usize,
        id: &str,
        species: &str,
    ) -> Token {
        testing_env!(ctx
            .predecessor_account_id(accounts(who))
            .attached_deposit(MINT_DEPOSIT)
            .build());
        c.nft_mint(
            id.to_string(),
            accounts(1),
            species.to_string(),
            creature("Gwisp"),
        )
    }

    fn mint_as(ctx: &mut VMContextBuilder, c: &mut Contract, who: usize, id: &str) -> Token {
        mint_species(ctx, c, who, id, "gwisp")
    }

    #[test]
    fn the_game_mints_a_creature_to_a_player() {
        let (mut ctx, mut c) = setup();
        let t = mint_as(&mut ctx, &mut c, 0, "c-1");
        assert_eq!(t.owner_id, accounts(1));
        let meta = t.metadata.unwrap();
        assert_eq!(meta.title.as_deref(), Some("Gwisp #1/1000"));
        assert_eq!(meta.copies, Some(1000));
        assert_eq!(c.nft_total_supply(), U128(1));
        assert_eq!(c.nft_tokens_for_owner(accounts(1), None, None).len(), 1);
        assert_eq!(c.game_account(), accounts(0));
    }

    #[test]
    #[should_panic(expected = "Only the game account can do this")]
    fn nobody_else_can_mint() {
        let (mut ctx, mut c) = setup();
        mint_as(&mut ctx, &mut c, 1, "c-1");
    }

    #[test]
    #[should_panic(expected = "token_id must be unique")]
    fn a_creature_is_minted_once() {
        let (mut ctx, mut c) = setup();
        mint_as(&mut ctx, &mut c, 0, "c-1");
        mint_as(&mut ctx, &mut c, 0, "c-1");
    }

    #[test]
    fn the_owner_can_give_or_sell_it() {
        let (mut ctx, mut c) = setup();
        mint_as(&mut ctx, &mut c, 0, "c-1");
        testing_env!(ctx
            .predecessor_account_id(accounts(1))
            .attached_deposit(NearToken::from_yoctonear(1))
            .build());
        c.nft_transfer(accounts(2), "c-1".to_string(), None, None);
        assert_eq!(
            c.nft_token("c-1".to_string()).unwrap().owner_id,
            accounts(2)
        );
        assert!(c.nft_tokens_for_owner(accounts(1), None, None).is_empty());
    }

    #[test]
    #[should_panic]
    fn the_game_cannot_take_it_back() {
        let (mut ctx, mut c) = setup();
        mint_as(&mut ctx, &mut c, 0, "c-1");
        testing_env!(ctx
            .predecessor_account_id(accounts(0))
            .attached_deposit(NearToken::from_yoctonear(1))
            .build());
        c.nft_transfer(accounts(0), "c-1".to_string(), None, None);
    }

    #[test]
    #[should_panic]
    fn minting_needs_a_storage_deposit() {
        let (mut ctx, mut c) = setup();
        testing_env!(ctx
            .predecessor_account_id(accounts(0))
            .attached_deposit(NearToken::from_yoctonear(0))
            .build());
        c.nft_mint(
            "c-1".to_string(),
            accounts(1),
            "gwisp".to_string(),
            creature("Gwisp"),
        );
    }

    #[test]
    fn editions_count_up_to_the_supply_of_each_species() {
        let (mut ctx, mut c) = setup();
        mint_as(&mut ctx, &mut c, 0, "c-1");
        let second = mint_as(&mut ctx, &mut c, 0, "c-2");
        assert_eq!(
            second.metadata.unwrap().title.as_deref(),
            Some("Gwisp #2/1000")
        );
        let epic = mint_species(&mut ctx, &mut c, 0, "e-1", "rugpullor");
        assert!(epic.metadata.unwrap().title.unwrap().ends_with("#1/2"));
        assert_eq!(
            c.species_supply("gwisp".into()),
            Some(Supply {
                minted: 2,
                max: 1000
            })
        );
        assert_eq!(c.species_supply("nobody".into()), None);
    }

    #[test]
    #[should_panic(expected = "Sold out")]
    fn a_species_sells_out_for_everyone() {
        let (mut ctx, mut c) = setup();
        mint_species(&mut ctx, &mut c, 0, "e-1", "rugpullor");
        mint_species(&mut ctx, &mut c, 0, "e-2", "rugpullor");
        mint_species(&mut ctx, &mut c, 0, "e-3", "rugpullor");
    }

    #[test]
    #[should_panic(expected = "Unknown species")]
    fn only_registered_species_can_be_minted() {
        let (mut ctx, mut c) = setup();
        mint_species(&mut ctx, &mut c, 0, "x-1", "nobody");
    }

    #[test]
    #[should_panic(expected = "fixed once registered")]
    fn the_supply_can_never_be_raised() {
        let (_ctx, mut c) = setup();
        c.register_species(vec![SpeciesSupply {
            species: "rugpullor".into(),
            max_supply: 99,
        }]);
    }

    #[test]
    #[should_panic(expected = "Only the game account can do this")]
    fn only_the_game_registers_species() {
        let (mut ctx, mut c) = setup();
        testing_env!(ctx.predecessor_account_id(accounts(1)).build());
        c.register_species(vec![SpeciesSupply {
            species: "fake".into(),
            max_supply: 1,
        }]);
    }

    // ------------------------------------------------------------------ trading

    const NEAR_1: u128 = 1_000_000_000_000_000_000_000_000;

    fn list(ctx: &mut VMContextBuilder, c: &mut Contract, who: usize, id: &str, price: u128) {
        testing_env!(ctx
            .predecessor_account_id(accounts(who))
            .attached_deposit(NearToken::from_yoctonear(LISTING_DEPOSIT))
            .build());
        c.market_list(id.to_string(), U128(price));
    }

    /// NEAR transfers the last call scheduled, as (receiver, yoctoNEAR).
    fn transfers() -> Vec<(String, u128)> {
        near_sdk::test_utils::get_created_receipts()
            .into_iter()
            .flat_map(|r| {
                let to = r.receiver_id.to_string();
                r.actions.into_iter().filter_map(move |a| match a {
                    near_sdk::mock::MockAction::Transfer { deposit, .. } => {
                        Some((to.clone(), deposit.as_yoctonear()))
                    }
                    _ => None,
                })
            })
            .collect()
    }

    #[test]
    fn a_sale_in_the_game_market_pays_seller_and_treasury() {
        let (mut ctx, mut c) = setup();
        mint_as(&mut ctx, &mut c, 0, "c-1");
        list(&mut ctx, &mut c, 1, "c-1", 2 * NEAR_1);
        assert_eq!(c.market_count(), 1);
        assert_eq!(
            c.market_listing("c-1".into()).unwrap().price,
            U128(2 * NEAR_1)
        );

        testing_env!(ctx
            .predecessor_account_id(accounts(2))
            .attached_deposit(NearToken::from_yoctonear(2 * NEAR_1))
            .build());
        let t = c.market_buy("c-1".into());
        assert_eq!(t.owner_id, accounts(2));
        assert_eq!(c.market_count(), 0);
        let fee = 2 * NEAR_1 / 20; // 5 %
        let paid = transfers();
        assert!(paid.contains(&(accounts(4).to_string(), fee)));
        assert!(paid.contains(&(accounts(1).to_string(), 2 * NEAR_1 - fee + LISTING_DEPOSIT)));
    }

    #[test]
    #[should_panic(expected = "Attach the full price")]
    fn buying_needs_the_full_price() {
        let (mut ctx, mut c) = setup();
        mint_as(&mut ctx, &mut c, 0, "c-1");
        list(&mut ctx, &mut c, 1, "c-1", 2 * NEAR_1);
        testing_env!(ctx
            .predecessor_account_id(accounts(2))
            .attached_deposit(NearToken::from_yoctonear(NEAR_1))
            .build());
        c.market_buy("c-1".into());
    }

    #[test]
    #[should_panic(expected = "Only the owner can sell this creature")]
    fn only_the_owner_lists() {
        let (mut ctx, mut c) = setup();
        mint_as(&mut ctx, &mut c, 0, "c-1");
        list(&mut ctx, &mut c, 2, "c-1", NEAR_1);
    }

    #[test]
    fn giving_a_listed_creature_away_ends_the_listing() {
        let (mut ctx, mut c) = setup();
        mint_as(&mut ctx, &mut c, 0, "c-1");
        list(&mut ctx, &mut c, 1, "c-1", NEAR_1);
        testing_env!(ctx
            .predecessor_account_id(accounts(1))
            .attached_deposit(NearToken::from_yoctonear(1))
            .build());
        c.nft_transfer(accounts(2), "c-1".into(), None, None);
        assert!(c.market_listing("c-1".into()).is_none());
        assert!(transfers().contains(&(accounts(1).to_string(), LISTING_DEPOSIT)));
    }

    #[test]
    fn outside_marketplaces_get_a_royalty_split() {
        let (mut ctx, mut c) = setup();
        mint_as(&mut ctx, &mut c, 0, "c-1");
        let p = c.nft_payout("c-1".into(), U128(10 * NEAR_1), Some(10));
        assert_eq!(p.payout.get(&accounts(4)), Some(&U128(NEAR_1 / 2)));
        assert_eq!(
            p.payout.get(&accounts(1)),
            Some(&U128(10 * NEAR_1 - NEAR_1 / 2))
        );

        // an approved marketplace transfers and gets the same split
        testing_env!(ctx
            .predecessor_account_id(accounts(1))
            .attached_deposit(NearToken::from_millinear(10))
            .build());
        c.nft_approve("c-1".into(), accounts(5), None);
        testing_env!(ctx
            .predecessor_account_id(accounts(5))
            .attached_deposit(NearToken::from_yoctonear(1))
            .build());
        let p = c.nft_transfer_payout(accounts(2), "c-1".into(), None, None, U128(NEAR_1), None);
        assert_eq!(c.nft_token("c-1".into()).unwrap().owner_id, accounts(2));
        assert_eq!(p.payout.len(), 2);
    }

    #[test]
    #[should_panic(expected = "Fees are capped at 20 %")]
    fn fees_are_capped() {
        let (_ctx, mut c) = setup();
        c.set_market(MarketConfig {
            treasury: accounts(4),
            royalty_bps: 2_500,
            market_fee_bps: 0,
        });
    }

    #[test]
    fn the_first_deploy_migrates_with_its_creatures() {
        let mut ctx = VMContextBuilder::new();
        ctx.current_account_id(accounts(3))
            .predecessor_account_id(accounts(0));
        testing_env!(ctx.build());
        let mut tokens = NonFungibleToken::new(
            StorageKey::NonFungibleToken,
            accounts(0),
            Some(StorageKey::TokenMetadata),
            Some(StorageKey::Enumeration),
            Some(StorageKey::Approval),
        );
        testing_env!(ctx.attached_deposit(MINT_DEPOSIT).build());
        tokens.internal_mint("c-1".into(), accounts(1), Some(creature("Gwisp #1/1000")));
        let mut species = LookupMap::new(StorageKey::Species);
        species.insert(
            &"gwisp".to_string(),
            &Supply {
                minted: 1,
                max: 1000,
            },
        );
        env::state_write(&ContractV1 {
            tokens,
            metadata: LazyOption::new(StorageKey::Metadata, Some(&contract_metadata())),
            species,
        });

        testing_env!(ctx.predecessor_account_id(accounts(3)).build()); // the contract itself
        let c = Contract::migrate(MarketConfig {
            treasury: accounts(4),
            royalty_bps: 500,
            market_fee_bps: 500,
        });
        assert_eq!(c.nft_token("c-1".into()).unwrap().owner_id, accounts(1));
        assert_eq!(
            c.species_supply("gwisp".into()),
            Some(Supply {
                minted: 1,
                max: 1000
            })
        );
        assert_eq!(c.market_config().treasury, accounts(4));
        assert_eq!(c.market_count(), 0);
    }
}
