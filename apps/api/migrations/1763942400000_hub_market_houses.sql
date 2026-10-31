-- Up Migration
-- The town market (players sell game items to each other for Gold) and houses with furniture.

CREATE TABLE hub_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- listings are only shown within the seller's age group, like everything social
  adult boolean NOT NULL,
  item_id text NOT NULL REFERENCES item_definitions (id),
  qty integer NOT NULL CHECK (qty > 0),
  -- price for the whole lot, in Gold
  price integer NOT NULL CHECK (price > 0),
  fee integer NOT NULL CHECK (fee >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'sold', 'cancelled', 'expired')),
  buyer_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz
);
CREATE INDEX hub_listings_open ON hub_listings (adult, item_id, price) WHERE status = 'open';
CREATE INDEX hub_listings_seller ON hub_listings (seller_id, created_at);
CREATE INDEX hub_listings_expiry ON hub_listings (expires_at) WHERE status = 'open';

CREATE TABLE hub_houses (
  owner_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  privacy text NOT NULL DEFAULT 'friends' CHECK (privacy IN ('private', 'friends', 'public')),
  -- what stands where: [{ f, x, y, flip }] in house-room world pixels
  layout jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE player_furniture (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  furniture_id text NOT NULL,
  qty integer NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (user_id, furniture_id)
);

-- Down Migration
DROP TABLE IF EXISTS player_furniture;
DROP TABLE IF EXISTS hub_houses;
DROP TABLE IF EXISTS hub_listings;
