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

use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_sdk::collections::{LazyOption, LookupMap};
use near_sdk::json_types::U128;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, PanicOnDefault, Promise, PromiseOrValue,
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
}

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
}

#[near]
impl Contract {
    /// `owner_id` is the game account: the only one allowed to mint.
    #[init]
    pub fn new(owner_id: AccountId, metadata: NFTContractMetadata) -> Self {
        require!(!env::state_exists(), "Already initialized");
        metadata.assert_valid();
        require!(metadata.spec == NFT_METADATA_SPEC, "Wrong metadata spec");
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
        }
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
        require!(supply.minted < supply.max, "Sold out: every edition of this species exists");
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
        let mut c = Contract::new(accounts(0), contract_metadata());
        c.register_species(vec![
            SpeciesSupply { species: "gwisp".into(), max_supply: 1000 },
            SpeciesSupply { species: "rugpullor".into(), max_supply: 2 },
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
        c.nft_mint(id.to_string(), accounts(1), species.to_string(), creature("Gwisp"))
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
        assert_eq!(c.nft_token("c-1".to_string()).unwrap().owner_id, accounts(2));
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
        c.nft_mint("c-1".to_string(), accounts(1), "gwisp".to_string(), creature("Gwisp"));
    }

    #[test]
    fn editions_count_up_to_the_supply_of_each_species() {
        let (mut ctx, mut c) = setup();
        mint_as(&mut ctx, &mut c, 0, "c-1");
        let second = mint_as(&mut ctx, &mut c, 0, "c-2");
        assert_eq!(second.metadata.unwrap().title.as_deref(), Some("Gwisp #2/1000"));
        let epic = mint_species(&mut ctx, &mut c, 0, "e-1", "rugpullor");
        assert!(epic.metadata.unwrap().title.unwrap().ends_with("#1/2"));
        assert_eq!(
            c.species_supply("gwisp".into()),
            Some(Supply { minted: 2, max: 1000 })
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
        c.register_species(vec![SpeciesSupply { species: "rugpullor".into(), max_supply: 99 }]);
    }

    #[test]
    #[should_panic(expected = "Only the game account can do this")]
    fn only_the_game_registers_species() {
        let (mut ctx, mut c) = setup();
        testing_env!(ctx.predecessor_account_id(accounts(1)).build());
        c.register_species(vec![SpeciesSupply { species: "fake".into(), max_supply: 1 }]);
    }
}
