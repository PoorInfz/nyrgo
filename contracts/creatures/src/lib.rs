//! nyrGo! creatures as NFTs (NEP-171 core, NEP-177 metadata, NEP-178 approvals, NEP-181
//! enumeration), built on NEAR's own `near-contract-standards`.
//!
//! The NFT *is* the creature: whoever owns the token owns the creature in the game. Only the game
//! account (`owner_id`) can mint, and it pays the storage of every token it mints. Everything else
//! (transfers, approvals for marketplaces, enumeration) is the standard implementation, unchanged.
//! Testnet only until the Phase 6 gates.

use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_sdk::collections::LazyOption;
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
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
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
        }
    }

    /// Mints one creature to a player's account. Game account only; the attached deposit pays
    /// the token's storage and any excess is refunded.
    #[payable]
    pub fn nft_mint(
        &mut self,
        token_id: TokenId,
        token_owner_id: AccountId,
        token_metadata: TokenMetadata,
    ) -> Token {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only the game account can mint"
        );
        require!(
            token_id.len() <= 64 && !token_id.is_empty(),
            "Token ids are 1-64 characters"
        );
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

    /// accounts(0) = game account, accounts(1) and (2) = players.
    fn setup() -> (VMContextBuilder, Contract) {
        let mut ctx = VMContextBuilder::new();
        ctx.current_account_id(accounts(3))
            .predecessor_account_id(accounts(0));
        testing_env!(ctx.build());
        (ctx, Contract::new(accounts(0), contract_metadata()))
    }

    fn mint_as(ctx: &mut VMContextBuilder, c: &mut Contract, who: usize, id: &str) -> Token {
        testing_env!(ctx
            .predecessor_account_id(accounts(who))
            .attached_deposit(MINT_DEPOSIT)
            .build());
        c.nft_mint(id.to_string(), accounts(1), creature("Gwisp"))
    }

    #[test]
    fn the_game_mints_a_creature_to_a_player() {
        let (mut ctx, mut c) = setup();
        let t = mint_as(&mut ctx, &mut c, 0, "c-1");
        assert_eq!(t.owner_id, accounts(1));
        assert_eq!(t.metadata.unwrap().title.as_deref(), Some("Gwisp"));
        assert_eq!(c.nft_total_supply(), U128(1));
        assert_eq!(c.nft_tokens_for_owner(accounts(1), None, None).len(), 1);
        assert_eq!(c.game_account(), accounts(0));
    }

    #[test]
    #[should_panic(expected = "Only the game account can mint")]
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
        c.nft_mint("c-1".to_string(), accounts(1), creature("Gwisp"));
    }
}
