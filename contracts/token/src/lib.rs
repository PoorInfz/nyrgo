//! NYRGO, the nyrGo! game token: a plain NEP-141 fungible token (with NEP-145 storage management
//! and NEP-148 metadata) on NEAR's own `near-contract-standards`.
//!
//! The whole supply is created once, at initialisation, in the owner's account (the game
//! account), and there is no way to create more: no mint function exists. Players receive
//! tokens by transfer from the game's rewards; everything else (transfers, transfer-and-call to
//! exchanges, storage registration) is the standard implementation, unchanged. Testnet only
//! until the Phase 6 gates.

use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue,
};

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    FungibleToken,
    Metadata,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
}

#[near]
impl Contract {
    /// Creates the whole `total_supply` in `owner_id`'s account. Callable once.
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128, metadata: FungibleTokenMetadata) -> Self {
        require!(!env::state_exists(), "Already initialized");
        metadata.assert_valid();
        require!(metadata.spec == FT_METADATA_SPEC, "Wrong metadata spec");
        require!(total_supply.0 > 0, "The supply must be above zero");
        let mut this = Self {
            token: FungibleToken::new(StorageKey::FungibleToken),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
        };
        this.token.internal_register_account(&owner_id);
        this.token.internal_deposit(&owner_id, total_supply.0);
        FtMint {
            owner_id: &owner_id,
            amount: total_supply,
            memo: Some("fixed supply, created once"),
        }
        .emit();
        this
    }
}

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, _burned) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        // Never with a balance: unregistering with force would burn tokens and shrink the supply
        // the game promised. Holders move their tokens out first.
        require!(force != Some(true), "Forced unregistering is disabled");
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const SUPPLY: u128 = 1_000_000_000 * 10u128.pow(18);

    fn meta() -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "nyrGo!".to_string(),
            symbol: "NYRGO".to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 18,
        }
    }

    fn ctx(predecessor: AccountId) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id("token.game.testnet".parse().unwrap())
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor);
        b
    }

    fn init() -> Contract {
        testing_env!(ctx(accounts(0)).build());
        Contract::new(accounts(0), U128(SUPPLY), meta())
    }

    #[test]
    fn the_whole_supply_starts_with_the_owner() {
        let c = init();
        assert_eq!(c.ft_total_supply().0, SUPPLY);
        assert_eq!(c.ft_balance_of(accounts(0)).0, SUPPLY);
        assert_eq!(c.ft_balance_of(accounts(1)).0, 0);
        assert_eq!(c.ft_metadata().symbol, "NYRGO");
    }

    #[test]
    fn transfers_to_a_registered_account_keep_the_supply() {
        let mut c = init();
        let bounds = c.storage_balance_bounds();
        testing_env!(ctx(accounts(0)).attached_deposit(bounds.min).build());
        c.storage_deposit(Some(accounts(1)), None);
        testing_env!(ctx(accounts(0))
            .attached_deposit(NearToken::from_yoctonear(1))
            .build());
        c.ft_transfer(accounts(1), U128(250), Some("reward".into()));
        assert_eq!(c.ft_balance_of(accounts(1)).0, 250);
        assert_eq!(c.ft_balance_of(accounts(0)).0, SUPPLY - 250);
        assert_eq!(c.ft_total_supply().0, SUPPLY);
    }

    #[test]
    #[should_panic(expected = "is not registered")]
    fn an_unregistered_receiver_is_refused() {
        let mut c = init();
        testing_env!(ctx(accounts(0))
            .attached_deposit(NearToken::from_yoctonear(1))
            .build());
        c.ft_transfer(accounts(2), U128(1), None);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn transfers_need_the_one_yocto_confirmation() {
        let mut c = init();
        testing_env!(ctx(accounts(0)).build());
        c.ft_transfer(accounts(1), U128(1), None);
    }

    #[test]
    #[should_panic(expected = "Forced unregistering is disabled")]
    fn forced_unregistering_cannot_burn_tokens() {
        let mut c = init();
        testing_env!(ctx(accounts(0))
            .attached_deposit(NearToken::from_yoctonear(1))
            .build());
        c.storage_unregister(Some(true));
    }

    #[test]
    #[should_panic(expected = "Already initialized")]
    fn it_can_be_initialised_only_once() {
        let c = init();
        env::state_write(&c);
        Contract::new(accounts(1), U128(1), meta());
    }
}
