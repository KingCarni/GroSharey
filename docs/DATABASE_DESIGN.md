# GroSharey Core Database Design

Status: Initial design for **GRO-7**.

## Goals

The core model must support:

- isolated household data;
- household roles and invitations;
- multiple shared lists;
- real-time grocery item changes;
- shopping sessions;
- household chat and item notes;
- notification preferences and delivery records;
- seven-day trials and household subscriptions;
- future receipts, products, stores and anonymized price observations without redesigning core ownership.

## Proposed backend

Use **Supabase** for the first implementation:

- PostgreSQL database;
- Supabase Auth;
- Row Level Security (RLS);
- Realtime subscriptions;
- Storage for future receipt images;
- Edge Functions or a dedicated service for privileged operations.

This remains a proposed direction until implementation is confirmed.

## Core tables

### profiles

Application profile linked one-to-one with the authentication user.

- `id uuid primary key` — matches auth user ID
- `display_name text`
- `avatar_url text nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

### households

- `id uuid primary key`
- `name text`
- `created_by uuid references profiles(id)`
- `trial_started_at timestamptz nullable`
- `trial_expires_at timestamptz nullable`
- `created_at timestamptz`
- `updated_at timestamptz`
- `deleted_at timestamptz nullable`

### household_memberships

- `id uuid primary key`
- `household_id uuid references households(id)`
- `user_id uuid references profiles(id)`
- `role text` — `owner`, `member`
- `status text` — `active`, `invited`, `removed`, `left`
- `joined_at timestamptz nullable`
- `created_at timestamptz`
- `updated_at timestamptz`
- unique active membership per household/user

### household_invites

- `id uuid primary key`
- `household_id uuid references households(id)`
- `invited_by uuid references profiles(id)`
- `token_hash text unique`
- `expires_at timestamptz`
- `accepted_by uuid nullable references profiles(id)`
- `accepted_at timestamptz nullable`
- `revoked_at timestamptz nullable`
- `created_at timestamptz`

Raw invite tokens must not be stored after issuance.

### grocery_lists

- `id uuid primary key`
- `household_id uuid references households(id)`
- `name text`
- `created_by uuid references profiles(id)`
- `archived_at timestamptz nullable`
- `deleted_at timestamptz nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

### grocery_items

- `id uuid primary key`
- `list_id uuid references grocery_lists(id)`
- `name text`
- `quantity numeric nullable`
- `unit text nullable`
- `brand text nullable`
- `category text nullable`
- `notes text nullable`
- `position numeric`
- `is_completed boolean default false`
- `completed_by uuid nullable references profiles(id)`
- `completed_at timestamptz nullable`
- `created_by uuid references profiles(id)`
- `created_at timestamptz`
- `updated_at timestamptz`
- `deleted_at timestamptz nullable`
- `version integer default 1`

The version field supports optimistic conflict detection for concurrent edits.

### shopping_sessions

- `id uuid primary key`
- `household_id uuid references households(id)`
- `list_id uuid references grocery_lists(id)`
- `shopper_id uuid references profiles(id)`
- `store_name text nullable`
- `status text` — `active`, `completed`, `cancelled`
- `started_at timestamptz`
- `ended_at timestamptz nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

Only one active shopping session per list should be allowed initially.

### messages

Supports household chat and item-specific discussion.

- `id uuid primary key`
- `household_id uuid references households(id)`
- `item_id uuid nullable references grocery_items(id)`
- `author_id uuid references profiles(id)`
- `body text`
- `created_at timestamptz`
- `updated_at timestamptz nullable`
- `deleted_at timestamptz nullable`

### notification_preferences

- `id uuid primary key`
- `household_id uuid references households(id)`
- `user_id uuid references profiles(id)`
- `item_added boolean default true`
- `item_changed boolean default false`
- `shopping_started boolean default true`
- `shopping_completed boolean default true`
- `messages boolean default true`
- `created_at timestamptz`
- `updated_at timestamptz`
- unique household/user preference record

### device_push_tokens

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `expo_push_token text unique`
- `platform text`
- `app_version text nullable`
- `last_seen_at timestamptz`
- `revoked_at timestamptz nullable`
- `created_at timestamptz`

### notification_deliveries

- `id uuid primary key`
- `household_id uuid references households(id)`
- `recipient_id uuid references profiles(id)`
- `actor_id uuid nullable references profiles(id)`
- `type text`
- `entity_type text nullable`
- `entity_id uuid nullable`
- `provider_message_id text nullable`
- `status text` — `queued`, `sent`, `failed`, `opened`
- `failure_reason text nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

### household_subscriptions

- `id uuid primary key`
- `household_id uuid unique references households(id)`
- `provider text`
- `provider_customer_id text nullable`
- `provider_subscription_id text nullable`
- `status text` — `trialing`, `active`, `past_due`, `cancelled`, `expired`
- `included_members integer default 2`
- `additional_member_count integer default 0`
- `current_period_end timestamptz nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

Billing provider events, not the mobile client, must be the source of truth for paid status.

## Future-compatible ownership

Future receipt and pricing tables should reference `household_id` for private data. Community observations should be produced into a separate de-identified model rather than exposing receipt or household records.

Planned future entities include:

- `receipts`
- `receipt_images`
- `receipt_lines`
- `stores`
- `store_locations`
- `products`
- `product_aliases`
- `price_observations_private`
- `price_observations_community`
- `community_consent_versions`

## Access rules

### General

- All private household records require an authenticated user.
- A user may access a household-scoped row only when they have an active membership in that household.
- Household membership checks must occur in database policies or trusted server code.
- The client must never be trusted to provide an unrestricted `household_id`.
- Soft-deleted rows are excluded from normal reads.

### Owners

Household owners may:

- edit household settings;
- create and revoke invitations;
- remove members;
- manage billing;
- request household deletion or export.

### Members

Active members may:

- read household members;
- create and update lists and items;
- start shopping sessions;
- create messages;
- manage their own notification preferences and device tokens.

### Sensitive operations

The following should use a server function or security-definer database function rather than direct client mutations:

- creating a household and its initial owner membership atomically;
- accepting an invitation;
- transferring ownership;
- deleting a household;
- applying subscription-provider events;
- generating community price observations;
- accessing administrative moderation data.

## Initial RLS policy shape

Create a helper function similar to:

```sql
is_active_household_member(target_household_id uuid)
```

It should return true when `auth.uid()` has an active membership for the supplied household.

Household-scoped table policies should then enforce:

- `SELECT`: active household member;
- `INSERT`: active household member, with creator fields matching `auth.uid()` where applicable;
- `UPDATE`: active household member plus entity-specific ownership/role requirements;
- `DELETE`: normally represented by controlled soft deletion rather than unrestricted physical deletion.

## Audit and consistency requirements

- Use UTC timestamps generated by the database.
- Add `created_at` and `updated_at` consistently.
- Preserve actor IDs for important user actions.
- Use check constraints for role, status and type fields.
- Add foreign-key indexes for household, list and user access paths.
- Use database transactions for household creation, invite acceptance and session completion.
- Prevent duplicate active memberships and duplicate active shopping sessions.
- Prevent a household from having zero active owners.

## Migration strategy

- Store versioned SQL migrations in `supabase/migrations`.
- Migrations must be reproducible against local, test and production environments.
- Seed data should use fictional test households and users only.
- Automated tests should attempt cross-household reads and writes to prove RLS isolation.

## Open decisions

- Confirm Supabase as the backend before implementation.
- Decide whether one user can belong to multiple households at launch.
- Decide whether members may create multiple lists during the trial.
- Select the subscription source of truth for Android launch.
- Define exact retention periods for soft-deleted messages and lists.
