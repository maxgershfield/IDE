# Component Holons — Agent Team Brief

**Document purpose:** Specification for a library of reusable "component holons" — self-contained building blocks that any OAPP can compose to bootstrap an app without writing boilerplate from scratch.

**For agent team:** This brief defines what each holon manages, its data schema, operations, events, cross-framework equivalents, and STAR scaffolding notes. Build against the OASIS `OASISResult<T>` pattern. Do not add shims or fallback paths — see `Docs/Devs/AGENT_Root_Cause_No_Fallbacks.md`.

---

## Intended destination: STARNET + OASIS IDE

**These holons must be published to STARNET** so that the OASIS IDE agent can discover and use them when helping users build OAPPs.

### How this fits the OASIS IDE workflow

1. **Published to STARNET.** Each component holon is activated on STARNET (via `star activate` or the IDE's STAR CLI bridge) so it appears in `star_list_holons` and `star_list_oapps` responses. The IDE agent calls these MCP tools when a user asks it to build or suggest an app structure.

2. **Discoverable by the IDE agent.** When a user says "build me a community app with geo check-ins and karma", the agent calls `star_list_holons`, sees `GeoHolon`, `KarmaHolon`, `QuestHolon`, etc., understands their capabilities from their STARNET metadata, and proposes a composition — including a holonic architecture diagram — grounded in real, deployable holons rather than invented abstractions.

3. **Usable as OAPP scaffolds.** Holons marked as full app modules (`QuestHolon`, `SocialGraphHolon`, `GeoHolon`) should also be published as STARNET OAPP templates. When a user clicks "Create OAPP" in the IDE and selects a template, these holons are wired together automatically by the STAR CLI.

4. **Invocable by the IDE agent via MCP.** Each holon's Manager operations (e.g. `QuestHolonManager.Create`, `KarmaHolonManager.Award`) must be registered as MCP tools in `MCP/src/tools/` so the IDE agent can invoke them during a live session — not just read about them, but actually call them on behalf of the user.

5. **Rendered in the holonic diagram.** When the IDE agent produces an `<oasis_holon_diagram>` block in its reply, the nodes it draws should be these STARNET holons — real published names like `GeoHolon`, `KarmaHolon`, `AuthHolon` — not invented names. The diagram is only useful if clicking through leads to a real, deployable holon.

### Publication checklist (for agent team, per holon)

- [ ] C# `HolonBase` subclass implemented with all schema fields
- [ ] Manager class with `OASISResult<T>`-returning operations
- [ ] STARNET metadata set: `name`, `description`, `category`, `version`, `author`
- [ ] Published to STARNET via `star publish` and confirmed visible in `star_list_holons`
- [ ] MCP tool registered in `MCP/src/tools/` (following `starTools.ts` pattern) so the IDE agent can invoke operations
- [ ] OAPP template created (for module-level holons) and visible in `star_list_oapps`
- [ ] README added at `STAR ODK/templates/<HolonName>/README.md` describing the holon's role, operations, and typical wiring

---

## Design Principles

1. **Schema-first, renderer-agnostic.** Each holon owns its data contract and business logic. The UI framework (React, Flutter, Unity, Vue) is a renderer that plugs in — the holon does not care which one.
2. **Single responsibility.** One holon, one concern. `AuthHolon` does identity. `KarmaHolon` does points. They compose via edges, not by merging.
3. **Event-driven connections.** Holons communicate via typed events (e.g. `auth.login` → `karma.init`, `quest.complete` → `notification.push`). Hard-coded calls between holons are a code smell.
4. **Minimal required fields.** Each holon exposes a minimum viable schema. Extended fields are optional. Downstream apps add properties; they do not fork the holon.
5. **OASIS-native identity.** Every holon stores its owner via `AvatarId` (OASIS identity layer). No separate user tables.

---

## Tier 1 — Universal Core (every app needs these)

### 1. `AuthHolon`

**Purpose:** Identity, session management, OAuth providers, JWT issuance.

**Schema:**
```
id: Guid
avatarId: Guid              // links to OASIS Avatar
email: string
passwordHash: string        // bcrypt, never stored plaintext
providers: OAuthProvider[]  // Google, Apple, X, Discord, Wallet
sessionToken: string        // JWT or opaque token
sessionExpiry: DateTime
mfaEnabled: bool
createdAt: DateTime
lastLoginAt: DateTime
```

**Operations:**
- `Register(email, password) → OASISResult<AuthHolon>`
- `Login(email, password) → OASISResult<SessionToken>`
- `LoginWithOAuth(provider, code) → OASISResult<SessionToken>`
- `LoginWithWallet(address, signature) → OASISResult<SessionToken>`
- `RefreshToken(token) → OASISResult<SessionToken>`
- `Logout(sessionToken) → OASISResult<bool>`
- `RequestPasswordReset(email) → OASISResult<bool>`
- `VerifyEmail(token) → OASISResult<bool>`
- `EnableMFA() → OASISResult<MFASetup>`

**Events emitted:**
- `auth.registered` → triggers `UserProfileHolon.create`
- `auth.login` → triggers `ActivityFeedHolon.log`, `NotificationHolon.welcome`
- `auth.logout` → clears local session state
- `auth.wallet_linked` → triggers `WalletHolon.init`

**Framework equivalents:**

| Framework | Equivalent |
|-----------|-----------|
| Next.js | NextAuth.js / WorkOS / Auth.js (App Router, `httpOnly` cookies) |
| React Native | AWS Amplify Auth / Supabase Auth / Clerk |
| Flutter | Firebase Auth / Supabase Auth / `flutter_appauth` |
| Unity/C# | PlayFab Auth / OASIS `AvatarManager.Login` |
| Vue | Nuxt Auth / Pinia auth store |

**STAR scaffolding notes:** Wraps `STAR.OASISAPI.Avatar.LoginAsync`. The holon's `avatarId` IS the OASIS avatar — do not create a parallel identity table. Use `AvatarManager` from `NextGenSoftware.OASIS.API.Core`.

---

### 2. `UserProfileHolon`

**Purpose:** Public and private profile data, preferences, avatar customisation.

**Schema:**
```
id: Guid
avatarId: Guid
username: string            // unique, indexed
displayName: string
bio: string
avatarImageUrl: string
bannerImageUrl: string
location: string?
websiteUrl: string?
socialLinks: SocialLink[]   // { platform, handle }
preferences: JsonObject     // theme, language, notifications opt-in
isPrivate: bool
followersCount: int         // denormalised from SocialGraphHolon
followingCount: int
karmaScore: int             // denormalised from KarmaHolon
updatedAt: DateTime
```

**Operations:**
- `GetProfile(avatarId) → OASISResult<UserProfileHolon>`
- `UpdateProfile(fields) → OASISResult<UserProfileHolon>`
- `UploadAvatar(imageBlob) → OASISResult<string>` (returns CDN URL)
- `UpdatePreferences(prefs) → OASISResult<bool>`
- `DeactivateAccount() → OASISResult<bool>`

**Events emitted:**
- `profile.updated` → triggers `ActivityFeedHolon.log`
- `profile.avatar_changed`

**Framework equivalents:** React Query + REST; Flutter `Provider`; SwiftUI `@ObservedObject`; Unity `PlayerPrefs` + REST.

---

### 3. `NotificationHolon`

**Purpose:** Push notifications, in-app notification centre, email triggers.

**Schema:**
```
id: Guid
recipientAvatarId: Guid
type: NotificationType      // push | in_app | email | sms
channel: string             // 'quest_complete', 'new_follower', etc.
title: string
body: string
imageUrl: string?
actionUrl: string?          // deep link
isRead: bool
isSent: bool
sentAt: DateTime?
createdAt: DateTime
metadata: JsonObject        // source holon id, event context
```

**Operations:**
- `Send(notification) → OASISResult<bool>`
- `MarkRead(notificationId) → OASISResult<bool>`
- `MarkAllRead(avatarId) → OASISResult<bool>`
- `GetInbox(avatarId, page) → OASISResult<Page<NotificationHolon>>`
- `GetUnreadCount(avatarId) → OASISResult<int>`
- `UpdateDeviceToken(avatarId, token, platform) → OASISResult<bool>`
- `Unsubscribe(avatarId, channel) → OASISResult<bool>`

**Events emitted:**
- `notification.sent`
- `notification.read`

**Delivery backends:** FCM (Android/Flutter), APNs (iOS), Web Push (browser), SMTP (email). The holon abstracts provider — swap the delivery adapter without changing the schema.

**Framework equivalents:** Firebase Messaging / OneSignal / Expo Notifications; in-app: websocket subscription or SSE.

---

### 4. `SettingsHolon`

**Purpose:** App-level configuration per user: theme, language, feature flags, privacy controls.

**Schema:**
```
id: Guid
avatarId: Guid
theme: string               // 'dark' | 'light' | 'system'
language: string            // ISO 639-1
timezone: string            // IANA zone
notificationsEnabled: JsonObject  // { push, email, sms } booleans per channel
privacySettings: JsonObject       // { showLocation, showActivity, allowTagging }
accessibilitySettings: JsonObject // { fontSize, reduceMotion, highContrast }
featureFlags: JsonObject    // server-driven flags, overridable per user
updatedAt: DateTime
```

**Operations:**
- `Get(avatarId) → OASISResult<SettingsHolon>`
- `Update(fields) → OASISResult<SettingsHolon>`
- `Reset() → OASISResult<SettingsHolon>` (restores defaults)

---

## Tier 2 — Data & Persistence

### 5. `FeedHolon`

**Purpose:** Paginated, filterable, sortable list of any entity type. Powers home feeds, search results, activity streams.

**Schema:**
```
id: Guid
ownerAvatarId: Guid
feedType: string            // 'home' | 'trending' | 'following' | 'custom'
items: FeedItem[]
  itemId: Guid
  itemType: string          // 'post' | 'quest' | 'nft' | 'event' | any holon type
  itemHolonRef: Guid
  score: float              // ranking signal
  timestamp: DateTime
pageToken: string?             // opaque pagination token
hasMore: bool
lastFetchedAt: DateTime
```

**Operations:**
- `GetFeed(avatarId, feedType, pageToken, limit) → OASISResult<FeedHolon>`
- `RefreshFeed(feedId) → OASISResult<FeedHolon>`
- `AppendItem(feedId, item) → OASISResult<bool>`
- `RemoveItem(feedId, itemId) → OASISResult<bool>`
- `PinItem(feedId, itemId) → OASISResult<bool>`

**Ranking signals:** recency, karma of author, follower overlap, engagement rate. Pass as a `RankingStrategy` enum — do not hardcode in the holon.

**Framework equivalents:** React Query infinite queries; Flutter `ListView.builder` + BLoC; React Native `FlatList`; Unity `ScrollRect` + paginated API calls.

---

### 6. `SearchHolon`

**Purpose:** Full-text search across holon types with filters, facets, and ranking.

**Schema:**
```
id: Guid
query: string
scope: string[]             // holon types to search: ['UserProfile', 'Quest', 'NFT']
filters: JsonObject         // { type, dateRange, location, tags }
results: SearchResult[]
  holonType: string
  holonId: Guid
  title: string
  snippet: string
  score: float
  thumbnailUrl: string?
totalCount: int
pageToken: string?
executedAt: DateTime
```

**Operations:**
- `Search(query, scope, filters, pageToken) → OASISResult<SearchHolon>`
- `Suggest(partialQuery, scope) → OASISResult<string[]>`
- `Index(holonId, holonType) → OASISResult<bool>` (called by other holons on create/update)
- `Deindex(holonId) → OASISResult<bool>`

**Index backends:** Meilisearch (self-hosted), Typesense, or Elasticsearch adapter — holon owns the schema, not the engine.

---

### 7. `FileStorageHolon`

**Purpose:** Upload, store, and deliver files (images, video, audio, documents). Returns CDN URLs.

**Schema:**
```
id: Guid
uploaderAvatarId: Guid
filename: string
mimeType: string
sizeBytes: int
storageUrl: string          // internal storage path
cdnUrl: string              // public delivery URL
thumbnailUrl: string?
durationSeconds: float?     // audio/video
width: int?                 // images
height: int?
isPublic: bool
tags: string[]
associatedHolonId: Guid?    // e.g. the NFT or post this file belongs to
createdAt: DateTime
```

**Operations:**
- `Upload(file, metadata) → OASISResult<FileStorageHolon>`
- `GetFile(fileId) → OASISResult<FileStorageHolon>`
- `DeleteFile(fileId) → OASISResult<bool>`
- `GenerateThumbnail(fileId) → OASISResult<string>` (async)
- `GetSignedUploadUrl(filename, mimeType) → OASISResult<string>` (pre-signed S3/R2 URL)

**Storage backends:** AWS S3, Cloudflare R2, IPFS (for NFT-associated files). Adapter interface, swap without schema change.

---

### 8. `FormHolon`

**Purpose:** Schema-driven form definition, validation rules, submission handling, and error state. Lets the AI define a form without writing UI code.

**Schema:**
```
id: Guid
formKey: string             // e.g. 'onboarding', 'mint_nft', 'quest_create'
fields: FormField[]
  key: string
  label: string
  type: string              // text | email | number | select | multiselect | file | date | rich_text
  required: bool
  validation: ValidationRule[]  // { rule: 'min_length', value: 8 }, { rule: 'regex', value: '...' }
  placeholder: string?
  options: string[]?        // for select/multiselect
  defaultValue: any?
submitLabel: string
successMessage: string
values: JsonObject          // current field values (runtime)
errors: JsonObject          // field-level error messages (runtime)
isSubmitting: bool
isSubmitted: bool
```

**Operations:**
- `GetFormSchema(formKey) → OASISResult<FormHolon>`
- `ValidateField(formKey, fieldKey, value) → OASISResult<string?>` (null = valid)
- `ValidateAll(formKey, values) → OASISResult<JsonObject>` (map of field errors)
- `Submit(formKey, values) → OASISResult<JsonObject>` (delegates to the registered handler)
- `RegisterHandler(formKey, handlerFn)` (called at app init to wire submission logic)

---

## Tier 3 — Social & Communication

### 9. `ChatHolon`

**Purpose:** Real-time 1:1 and group messaging with threads, reactions, media, and read receipts.

**Schema:**
```
id: Guid
type: string                // 'direct' | 'group' | 'channel'
name: string?               // group/channel name
participants: Guid[]        // avatarIds
messages: Message[]
  id: Guid
  senderAvatarId: Guid
  content: string
  contentType: string       // 'text' | 'image' | 'file' | 'nft_share' | 'quest_invite'
  mediaUrl: string?
  reactions: Reaction[]     // { emoji, avatarIds[] }
  replyToId: Guid?
  readBy: Guid[]
  sentAt: DateTime
  editedAt: DateTime?
  deletedAt: DateTime?
unreadCount: int            // per-participant, derived
createdAt: DateTime
lastMessageAt: DateTime
```

**Operations:**
- `CreateConversation(participants, type, name?) → OASISResult<ChatHolon>`
- `SendMessage(chatId, message) → OASISResult<Message>`
- `EditMessage(messageId, content) → OASISResult<Message>`
- `DeleteMessage(messageId) → OASISResult<bool>`
- `AddReaction(messageId, emoji) → OASISResult<bool>`
- `MarkRead(chatId, avatarId) → OASISResult<bool>`
- `GetHistory(chatId, pageToken, limit) → OASISResult<Page<Message>>`
- `GetConversations(avatarId) → OASISResult<ChatHolon[]>`

**Real-time delivery:** WebSocket subscription per chatId. SSE fallback. The holon schema is stored; transport is an adapter.

**Framework equivalents:** Stream Chat (React/RN/Flutter SDK); socket.io; Supabase Realtime; Unity Mirror Networking.

---

### 10. `CommentHolon`

**Purpose:** Threaded comments on any entity (quests, NFTs, posts, events). Supports likes, reports, moderation.

**Schema:**
```
id: Guid
targetHolonId: Guid         // the thing being commented on
targetHolonType: string
parentCommentId: Guid?      // null = top-level, set = reply
authorAvatarId: Guid
content: string
likeCount: int
likedByAvatarIds: Guid[]    // consider separate LikeHolon at scale
isEdited: bool
isDeleted: bool             // soft delete; content replaced with '[deleted]'
isPinned: bool
reportCount: int
createdAt: DateTime
editedAt: DateTime?
children: CommentHolon[]    // hydrated on fetch, not stored nested
```

**Operations:**
- `AddComment(targetHolonId, content, parentId?) → OASISResult<CommentHolon>`
- `EditComment(commentId, content) → OASISResult<CommentHolon>`
- `DeleteComment(commentId) → OASISResult<bool>`
- `LikeComment(commentId, avatarId) → OASISResult<int>`
- `GetComments(targetHolonId, pageToken, sortBy) → OASISResult<Page<CommentHolon>>`
- `GetThread(commentId) → OASISResult<CommentHolon[]>` (parent + all descendants)
- `ReportComment(commentId, reason) → OASISResult<bool>`

---

### 11. `SocialGraphHolon`

**Purpose:** Follow, friend, block, and mute relationships between avatars. Drives feed personalisation and privacy.

**Schema:**
```
id: Guid
avatarId: Guid              // the subject of this graph record
following: Guid[]           // avatarIds this user follows
followers: Guid[]           // avatarIds that follow this user
blocked: Guid[]
muted: Guid[]
pendingFollowRequests: Guid[]  // for private accounts
followingCount: int
followersCount: int
updatedAt: DateTime
```

**Operations:**
- `Follow(sourceId, targetId) → OASISResult<bool>`
- `Unfollow(sourceId, targetId) → OASISResult<bool>`
- `AcceptFollow(targetId, sourceId) → OASISResult<bool>`
- `Block(sourceId, targetId) → OASISResult<bool>`
- `Mute(sourceId, targetId) → OASISResult<bool>`
- `GetFollowers(avatarId, pageToken) → OASISResult<Page<AvatarRef>>`
- `GetFollowing(avatarId, pageToken) → OASISResult<Page<AvatarRef>>`
- `IsFollowing(sourceId, targetId) → OASISResult<bool>`
- `GetMutualFollowers(idA, idB) → OASISResult<AvatarRef[]>`

**Events emitted:**
- `social.followed` → triggers `NotificationHolon.send` to target
- `social.unfollowed`

---

### 12. `ActivityFeedHolon`

**Purpose:** Chronological log of events for a user or entity. Powers "Your Activity", audit trails, "What's new".

**Schema:**
```
id: Guid
avatarId: Guid
events: ActivityEvent[]
  id: Guid
  type: string              // 'quest_complete' | 'nft_minted' | 'followed_by' | etc.
  actorAvatarId: Guid
  targetHolonId: Guid?
  targetHolonType: string?
  summary: string           // human-readable: "Alice completed Geo Hunt Mission 3"
  metadata: JsonObject
  timestamp: DateTime
pageToken: string?
hasMore: bool
```

**Operations:**
- `Log(avatarId, event) → OASISResult<bool>` (called by other holons, not directly by users)
- `GetFeed(avatarId, pageToken, limit) → OASISResult<ActivityFeedHolon>`
- `GetFeedForHolon(holonId, pageToken) → OASISResult<ActivityFeedHolon>` (audit trail for an entity)
- `ClearActivity(avatarId) → OASISResult<bool>`

---

## Tier 4 — Commerce & Value

### 13. `WalletHolon`

**Purpose:** Multi-chain crypto wallet + fiat balance aggregation. Holds balances, tracks transactions, signs payloads.

**Schema:**
```
id: Guid
avatarId: Guid
addresses: WalletAddress[]
  chain: string             // 'solana' | 'ethereum' | 'polygon' | 'bitcoin'
  address: string
  isPrimary: bool
nativeBalances: Balance[]   // { chain, amount, symbol }
tokenBalances: TokenBalance[] // { chain, mintAddress, symbol, amount }
fiatEquivalent: decimal     // USD sum of all balances (cached)
transactions: TxRef[]       // references to TransactionHolon
lastSyncedAt: DateTime
```

**Operations:**
- `GetBalances(walletId) → OASISResult<WalletHolon>`
- `GetTransactionHistory(walletId, pageToken) → OASISResult<Page<TxRef>>`
- `Sign(walletId, payload) → OASISResult<string>` (delegates to wallet adapter)
- `LinkExternalWallet(avatarId, address, chain, signature) → OASISResult<bool>`
- `SyncBalances(walletId) → OASISResult<bool>` (async refresh)

---

### 14. `PaymentHolon`

**Purpose:** Fiat and crypto payment flows: one-off purchases, subscriptions, invoices.

**Schema:**
```
id: Guid
payerAvatarId: Guid
payeeAvatarId: Guid?        // null = platform payment
amount: decimal
currency: string            // 'USD' | 'SOL' | 'ETH' | 'OASIS_TOKEN'
status: string              // 'pending' | 'complete' | 'failed' | 'refunded'
provider: string            // 'stripe' | 'solana_pay' | 'coinbase_commerce'
externalPaymentId: string?  // provider's transaction id
description: string
metadata: JsonObject        // line items, product ids
createdAt: DateTime
completedAt: DateTime?
```

**Operations:**
- `CreatePaymentIntent(amount, currency, metadata) → OASISResult<PaymentHolon>`
- `ConfirmPayment(paymentId, providerToken) → OASISResult<PaymentHolon>`
- `Refund(paymentId, reason) → OASISResult<bool>`
- `GetPaymentHistory(avatarId, pageToken) → OASISResult<Page<PaymentHolon>>`
- `CreateSubscription(avatarId, planId) → OASISResult<SubscriptionHolon>`

**Events emitted:**
- `payment.complete` → triggers `NotificationHolon.send`, `ActivityFeedHolon.log`

---

### 15. `TokenHolon`

**Purpose:** Fungible token management — issue, transfer, burn, airdrop. For OASIS-native tokens and SPL/ERC-20 bridges.

**Schema:**
```
id: Guid
mintAddress: string         // on-chain address
chain: string
symbol: string
name: string
decimals: int
totalSupply: decimal
circulatingSupply: decimal
logoUrl: string?
metadataUri: string?
ownerAvatarId: Guid         // issuer
isTransferable: bool
isBurnable: bool
createdAt: DateTime
```

**Operations:**
- `Mint(toAvatarId, amount) → OASISResult<TxRef>`
- `Transfer(fromAvatarId, toAvatarId, amount) → OASISResult<TxRef>`
- `Burn(avatarId, amount) → OASISResult<TxRef>`
- `Airdrop(recipients: {avatarId, amount}[]) → OASISResult<TxRef[]>`
- `GetBalance(avatarId) → OASISResult<decimal>`
- `GetHolders(pageToken) → OASISResult<Page<{avatarId, balance}>>`

---

### 16. `NFTHolon`

**Purpose:** Non-fungible asset creation, ownership, transfer, and metadata management.

**Schema:**
```
id: Guid
mintAddress: string
chain: string
ownerAvatarId: Guid
creatorAvatarId: Guid
name: string
description: string
imageUrl: string
metadataUri: string         // IPFS / Arweave URI
attributes: NFTAttribute[]  // { trait_type, value }
royaltyBps: int             // basis points (250 = 2.5%)
collectionId: Guid?
isTransferable: bool
isBurnable: bool
mintedAt: DateTime
```

**Operations:**
- `Mint(metadata, toAvatarId) → OASISResult<NFTHolon>`
- `Transfer(fromAvatarId, toAvatarId) → OASISResult<TxRef>`
- `Burn(avatarId) → OASISResult<TxRef>`
- `UpdateMetadata(fields) → OASISResult<NFTHolon>`
- `GetOwned(avatarId, pageToken) → OASISResult<Page<NFTHolon>>`
- `GetCollection(collectionId, pageToken) → OASISResult<Page<NFTHolon>>`
- `VerifyOwnership(avatarId, mintAddress) → OASISResult<bool>`

---

## Tier 5 — Gamification & Engagement

### 17. `KarmaHolon`

**Purpose:** Points, XP, levelling, and karma tracking across the OASIS graph.

**Schema:**
```
id: Guid
avatarId: Guid
totalKarma: int
level: int
xpToNextLevel: int
karmaEvents: KarmaEvent[]
  id: Guid
  delta: int                // positive = earned, negative = deducted
  reason: string            // 'quest_complete' | 'helpful_comment' | 'nft_created'
  sourceHolonId: Guid?
  timestamp: DateTime
levelHistory: LevelUp[]
  level: int
  achievedAt: DateTime
updatedAt: DateTime
```

**Operations:**
- `Award(avatarId, delta, reason, sourceHolonId?) → OASISResult<KarmaHolon>`
- `Deduct(avatarId, delta, reason) → OASISResult<KarmaHolon>`
- `GetKarma(avatarId) → OASISResult<KarmaHolon>`
- `GetLeaderboard(scope, limit) → OASISResult<KarmaHolon[]>` (delegates to `LeaderboardHolon`)

**Events emitted:**
- `karma.level_up` → triggers `NotificationHolon.send`, `AchievementHolon.check`

**STAR note:** Wraps `STAR.OASISAPI.Avatar.AddKarmaAsync`. Keep in sync with existing karma fields on the OASIS Avatar object.

---

### 18. `AchievementHolon`

**Purpose:** Badge and milestone definitions, unlock conditions, user progress tracking.

**Schema:**
```
id: Guid
key: string                 // unique slug: 'first_quest', 'top_10_karma'
name: string
description: string
iconUrl: string
category: string            // 'progression' | 'social' | 'collection' | 'special'
rarity: string              // 'common' | 'rare' | 'epic' | 'legendary'
condition: AchievementCondition
  type: string              // 'karma_threshold' | 'quest_count' | 'nft_owned' | 'custom'
  threshold: int?
  customCheck: string?      // reference to a registered server-side check function
xpReward: int
tokenReward: decimal?
nftReward: Guid?            // mint an NFT on unlock
unlockedByAvatarIds: Guid[]
isSecret: bool              // hidden until unlocked
createdAt: DateTime
```

**Operations:**
- `Define(achievement) → OASISResult<AchievementHolon>`
- `Check(avatarId, triggerEvent) → OASISResult<AchievementHolon[]>` (returns newly unlocked)
- `GetUnlocked(avatarId) → OASISResult<AchievementHolon[]>`
- `GetAll(includeSecret) → OASISResult<AchievementHolon[]>`
- `Award(achievementId, avatarId) → OASISResult<bool>` (manual grant)

**Events emitted:**
- `achievement.unlocked` → triggers `NotificationHolon.send`, `KarmaHolon.award`, `NFTHolon.mint` (if reward set)

---

### 19. `LeaderboardHolon`

**Purpose:** Ranked lists of avatars or entities by a numeric metric, across configurable time windows.

**Schema:**
```
id: Guid
key: string                 // 'global_karma' | 'quest_completions' | 'nft_sales'
name: string
metric: string              // field path to rank by
scope: string               // 'global' | 'regional' | 'friends'
timeframe: string           // 'all_time' | 'weekly' | 'daily'
entries: LeaderboardEntry[]
  rank: int
  avatarId: Guid
  displayName: string
  avatarImageUrl: string
  value: decimal
  delta: int                // rank change since last refresh
lastRefreshedAt: DateTime
refreshIntervalSeconds: int
```

**Operations:**
- `GetLeaderboard(key, timeframe, scope, pageToken) → OASISResult<LeaderboardHolon>`
- `GetRank(key, avatarId, timeframe) → OASISResult<LeaderboardEntry>`
- `RefreshLeaderboard(key) → OASISResult<bool>` (async recompute)
- `CreateLeaderboard(definition) → OASISResult<LeaderboardHolon>`

---

### 20. `QuestHolon`

**Purpose:** Mission definition, objective tracking, completion logic, and reward distribution.

**Schema:**
```
id: Guid
title: string
description: string
imageUrl: string
type: string                // 'linear' | 'branching' | 'daily' | 'geo'
status: string              // 'draft' | 'active' | 'expired' | 'complete'
objectives: Objective[]
  id: Guid
  order: int
  type: string              // 'checkin' | 'purchase' | 'social' | 'custom'
  description: string
  targetHolonId: Guid?      // e.g. a GeoLocationHolon checkpoint
  requiredCount: int
  completionCondition: JsonObject
rewards: Reward[]
  type: string              // 'karma' | 'token' | 'nft' | 'badge'
  amount: decimal?
  holonRef: Guid?
startAt: DateTime?
expiresAt: DateTime?
maxParticipants: int?
participantCount: int
completedByCount: int
creatorAvatarId: Guid
```

**Operations:**
- `Create(quest) → OASISResult<QuestHolon>`
- `Enroll(questId, avatarId) → OASISResult<QuestProgress>`
- `CompleteObjective(questId, avatarId, objectiveId, proofData) → OASISResult<QuestProgress>`
- `GetProgress(questId, avatarId) → OASISResult<QuestProgress>`
- `GetActiveQuests(filters) → OASISResult<Page<QuestHolon>>`
- `Complete(questId, avatarId) → OASISResult<Reward[]>` (distributes rewards)
- `Expire(questId) → OASISResult<bool>`

**Events emitted:**
- `quest.complete` → triggers `KarmaHolon.award`, `AchievementHolon.check`, `NotificationHolon.send`

---

## Tier 6 — Location & Context

### 21. `GeoHolon`

**Purpose:** Location check-ins, geofenced triggers, maps, and spatial queries.

**Schema:**
```
id: Guid
ownerAvatarId: Guid
type: string                // 'checkin' | 'geofence' | 'waypoint' | 'poi'
name: string?
latitude: double
longitude: double
radiusMeters: double?       // for geofences
altitudeMeters: double?
placeId: string?            // Google Place ID / OSM ref
address: string?
checkinCount: int
associatedHolonId: Guid?    // e.g. a QuestHolon objective
isActive: bool
createdAt: DateTime
lastCheckinAt: DateTime?
```

**Operations:**
- `Checkin(avatarId, lat, lng, accuracy) → OASISResult<GeoHolon>` (finds nearest active geofence)
- `CreateGeofence(definition) → OASISResult<GeoHolon>`
- `IsInsideGeofence(geoHolonId, lat, lng) → OASISResult<bool>`
- `GetNearby(lat, lng, radiusMeters, type) → OASISResult<GeoHolon[]>`
- `GetCheckinHistory(avatarId, pageToken) → OASISResult<Page<GeoHolon>>`

**Events emitted:**
- `geo.checkin` → triggers `QuestHolon.completeObjective`, `KarmaHolon.award`, `NFTHolon.mint`

---

### 22. `EventHolon`

**Purpose:** Scheduled real-world or virtual events, RSVP management, calendar integration.

**Schema:**
```
id: Guid
title: string
description: string
coverImageUrl: string
type: string                // 'virtual' | 'irl' | 'hybrid'
startAt: DateTime
endAt: DateTime
timezone: string
location: GeoRef?           // lat/lng + address for IRL
virtualUrl: string?         // meeting/stream link
organizerAvatarId: Guid
coOrganizerIds: Guid[]
maxAttendees: int?
rsvpCount: int
attendeeIds: Guid[]
tags: string[]
isPublic: bool
status: string              // 'upcoming' | 'live' | 'ended' | 'cancelled'
createdAt: DateTime
```

**Operations:**
- `Create(event) → OASISResult<EventHolon>`
- `RSVP(eventId, avatarId) → OASISResult<bool>`
- `CancelRSVP(eventId, avatarId) → OASISResult<bool>`
- `GetUpcoming(filters, pageToken) → OASISResult<Page<EventHolon>>`
- `GetAttendees(eventId, pageToken) → OASISResult<Page<AvatarRef>>`
- `Cancel(eventId) → OASISResult<bool>`
- `GoLive(eventId) → OASISResult<bool>`

**Events emitted:**
- `event.rsvp` → triggers `NotificationHolon.send` (reminder 24h before)
- `event.live` → triggers `NotificationHolon.send` to all RSVPs
- `event.cancelled` → triggers `NotificationHolon.send`

---

## Tier 7 — Content & Media

### 23. `PostHolon`

**Purpose:** User-generated content: text, links, media. Feeds into `FeedHolon`.

**Schema:**
```
id: Guid
authorAvatarId: Guid
contentType: string         // 'text' | 'image' | 'video' | 'link' | 'mixed'
body: string                // rich text / markdown
mediaIds: Guid[]            // references to FileStorageHolon
linkPreview: LinkPreview?   // { url, title, description, imageUrl }
tags: string[]
mentionedAvatarIds: Guid[]
linkedHolonId: Guid?        // e.g. attach post to a quest or NFT
likeCount: int
commentCount: int
shareCount: int
viewCount: int
isPublic: bool
isPinned: bool
isDeleted: bool
createdAt: DateTime
editedAt: DateTime?
```

**Operations:**
- `Create(post) → OASISResult<PostHolon>`
- `Edit(postId, fields) → OASISResult<PostHolon>`
- `Delete(postId) → OASISResult<bool>`
- `Like(postId, avatarId) → OASISResult<int>`
- `Share(postId, avatarId) → OASISResult<PostHolon>` (creates a share variant)
- `GetPost(postId) → OASISResult<PostHolon>`
- `GetByAuthor(avatarId, pageToken) → OASISResult<Page<PostHolon>>`

---

### 24. `MediaHolon`

**Purpose:** Media player state, playlists, streaming metadata. Wraps `FileStorageHolon` with playback logic.

**Schema:**
```
id: Guid
fileStorageId: Guid
type: string                // 'image' | 'video' | 'audio' | '3d_model' | 'ar'
streamUrl: string?          // HLS/DASH for video
thumbnailUrl: string
duration: float?
subtitleUrls: JsonObject?   // { en: 'url', es: 'url' }
playCount: int
currentPosition: float      // seconds (runtime, per-user)
isLive: bool
metadata: JsonObject        // codec, resolution, bitrate
```

**Operations:**
- `GetMedia(mediaId) → OASISResult<MediaHolon>`
- `GetStreamUrl(mediaId) → OASISResult<string>`
- `RecordPlay(mediaId, avatarId) → OASISResult<bool>`
- `SavePosition(mediaId, avatarId, position) → OASISResult<bool>`

---

---

## Tier 8 — Trust & Credentials

### 25. `CredentialHolon`

**Purpose:** W3C Verifiable Credentials — issue, hold, present, and verify tamper-proof attestations about an avatar. Powers professional certifications, fight sports records, KYC passes, age gates, and any real-world claim anchored to an OASIS identity.

**Why it matters for OASIS:** This is the core differentiator over centralised app platforms. A `CredentialHolon` issued by a fight gym persists on the OASIS graph and is portable — the fighter carries it into any OAPP that checks for it, without re-verifying.

**Schema:**
```
id: Guid
credentialId: string        // W3C VC "id" field — typically a DID URL
type: string[]              // ['VerifiableCredential', 'FightRecord', ...]
issuerDid: string           // DID of the issuing organisation/avatar
holderAvatarId: Guid        // the OASIS avatar that holds this credential
subjectClaims: JsonObject   // { belt: 'BJJ Blue', gym: 'Gracie Barra', wins: 14 }
issuanceDate: DateTime
expirationDate: DateTime?
status: string              // 'active' | 'revoked' | 'expired'
revocationReason: string?
proofType: string           // 'Ed25519Signature2020' | 'BbsBlsSignature2020'
proofValue: string          // cryptographic signature
schemaUri: string           // URI of the credential schema definition
isPublic: bool              // public credential vs private (holder-only)
verificationCount: int      // how many times this credential has been verified
createdAt: DateTime
```

**Operations:**
- `Issue(issuerDid, holderAvatarId, claims, schema, expiry?) → OASISResult<CredentialHolon>`
- `Present(credentialId, verifierDid, selectiveFields?) → OASISResult<VerifiablePresentation>` (selective disclosure)
- `Verify(presentation) → OASISResult<VerificationResult>` (checks signature + revocation status)
- `Revoke(credentialId, reason) → OASISResult<bool>`
- `GetHeld(avatarId, type?) → OASISResult<CredentialHolon[]>`
- `GetIssued(issuerDid, pageToken) → OASISResult<Page<CredentialHolon>>`
- `CheckRevocationStatus(credentialId) → OASISResult<bool>`

**Events emitted:**
- `credential.issued` → triggers `NotificationHolon.send`, `ActivityFeedHolon.log`
- `credential.verified` → triggers `AchievementHolon.check` (e.g. "verified athlete" badge)
- `credential.revoked` → triggers `NotificationHolon.send` to holder

**Example claim types:** `BJJBeltCredential`, `FightRecordCredential`, `AgeVerificationCredential`, `KYCPassedCredential`, `ProfessionalLicenceCredential`, `EventOrganizerCredential`.

**Framework equivalents:** Dock SDK, Veramo, SpruceID; OID4VC for wallet presentation flows.

**STAR scaffolding note:** Issuer DID should map to an OASIS Organisation Avatar. Use Ed25519 keys stored on the OASIS Avatar keychain.

---

### 26. `ReputationHolon`

**Purpose:** Peer-to-peer trust scores and ratings — how others rate an avatar, business, or entity. Distinct from `KarmaHolon` (which is platform-internal XP). Reputation is earned through others' explicit assessments.

**Schema:**
```
id: Guid
subjectId: Guid             // avatarId or holonId being rated
subjectType: string         // 'avatar' | 'business' | 'product' | 'service'
overallScore: float         // 0.0–5.0, weighted average
reviewCount: int
scoreBreakdown: JsonObject  // { quality: 4.2, reliability: 3.8, communication: 4.9 }
reviews: Review[]
  id: Guid
  reviewerAvatarId: Guid
  score: float
  dimensions: JsonObject    // per-dimension scores
  comment: string?
  isVerifiedPurchase: bool
  helpfulCount: int
  createdAt: DateTime
  editedAt: DateTime?
tags: string[]              // 'reliable', 'fast_delivery', 'expert'
trustLevel: string          // 'new' | 'established' | 'trusted' | 'verified'
updatedAt: DateTime
```

**Operations:**
- `SubmitReview(subjectId, score, dimensions, comment?) → OASISResult<Review>`
- `EditReview(reviewId, fields) → OASISResult<Review>`
- `DeleteReview(reviewId) → OASISResult<bool>`
- `GetReputation(subjectId) → OASISResult<ReputationHolon>`
- `GetReviews(subjectId, pageToken, sortBy) → OASISResult<Page<Review>>`
- `MarkHelpful(reviewId, avatarId) → OASISResult<int>`
- `ReportReview(reviewId, reason) → OASISResult<bool>`
- `CalculateTrustLevel(subjectId) → OASISResult<string>` (async recompute)

**Events emitted:**
- `reputation.review_submitted` → triggers `NotificationHolon.send` to subject
- `reputation.trust_level_changed` → triggers `NotificationHolon.send`, `FeedHolon.append`

---

### 27. `ModerationHolon`

**Purpose:** Content moderation pipeline: report intake, review queue, moderator decisions, AI pre-screening. Ensures any OAPP with user content has a safety layer without building one from scratch.

**Schema:**
```
id: Guid
targetHolonId: Guid         // the content being moderated
targetHolonType: string     // 'PostHolon' | 'CommentHolon' | 'UserProfile' | etc.
status: string              // 'clear' | 'flagged' | 'under_review' | 'removed' | 'appealed'
reports: Report[]
  id: Guid
  reporterAvatarId: Guid
  reason: string            // 'spam' | 'harassment' | 'illegal' | 'misinformation' | 'other'
  detail: string?
  createdAt: DateTime
aiScreeningResult: JsonObject?  // { safe: bool, categories: { hate: 0.02, violence: 0.8 } }
aiScreeningAt: DateTime?
assignedModeratorId: Guid?
moderatorDecision: string?  // 'approve' | 'remove' | 'warn' | 'ban'
moderatorNote: string?
decidedAt: DateTime?
appealStatus: string?       // 'none' | 'pending' | 'upheld' | 'overturned'
createdAt: DateTime
```

**Operations:**
- `Report(targetHolonId, targetType, reason, detail?) → OASISResult<Report>`
- `GetQueue(status, pageToken) → OASISResult<Page<ModerationHolon>>` (moderator dashboard)
- `Assign(moderationId, moderatorId) → OASISResult<bool>`
- `Decide(moderationId, decision, note?) → OASISResult<bool>`
- `AutoScreen(targetHolonId) → OASISResult<JsonObject>` (calls AI safety API async)
- `Appeal(moderationId, avatarId, reason) → OASISResult<bool>`
- `GetHistory(targetHolonId) → OASISResult<ModerationHolon[]>`

**Events emitted:**
- `moderation.removed` → triggers `NotificationHolon.send` to author, hides content
- `moderation.banned` → triggers `AuthHolon` to revoke session
- `moderation.appeal_resolved` → triggers `NotificationHolon.send`

---

## Tier 9 — Organisation & Governance

### 28. `TeamHolon`

**Purpose:** Groups, organisations, and guilds within an OAPP. Manages membership, roles (RBAC), shared assets, and team-level identity. Needed for multi-user workspaces, guilds in games, gyms, businesses, or any collective.

**Schema:**
```
id: Guid
name: string
description: string
avatarImageUrl: string
bannerImageUrl: string?
ownerAvatarId: Guid
members: TeamMember[]
  avatarId: Guid
  role: string              // 'owner' | 'admin' | 'moderator' | 'member' | custom
  joinedAt: DateTime
  invitedBy: Guid?
roles: TeamRole[]
  key: string
  label: string
  permissions: string[]     // ['post', 'invite', 'moderate', 'manage_treasury']
inviteCodes: InviteCode[]
  code: string
  expiresAt: DateTime?
  maxUses: int?
  useCount: int
sharedAssets: Guid[]        // tokenIds, NFT ids, shared wallet
isPublic: bool
memberCount: int
createdAt: DateTime
```

**Operations:**
- `Create(team) → OASISResult<TeamHolon>`
- `InviteMember(teamId, avatarId, role) → OASISResult<bool>`
- `AcceptInvite(teamId, avatarId) → OASISResult<bool>`
- `RemoveMember(teamId, avatarId) → OASISResult<bool>`
- `UpdateRole(teamId, avatarId, newRole) → OASISResult<bool>`
- `GenerateInviteCode(teamId, expiry?, maxUses?) → OASISResult<string>`
- `JoinWithCode(code, avatarId) → OASISResult<bool>`
- `HasPermission(teamId, avatarId, permission) → OASISResult<bool>`
- `GetTeams(avatarId) → OASISResult<TeamHolon[]>`
- `Disband(teamId) → OASISResult<bool>`

**Events emitted:**
- `team.member_joined` → triggers `ActivityFeedHolon.log`, `NotificationHolon.send`
- `team.member_removed` → triggers `NotificationHolon.send`

---

### 29. `DAOHolon`

**Purpose:** On-chain governance for an OAPP community: token-weighted proposals, voting, timelock execution, and treasury management.

**Schema:**
```
id: Guid
name: string
description: string
governanceTokenId: Guid     // TokenHolon used for voting power
ownerAvatarId: Guid
teamId: Guid?               // optional TeamHolon membership gate
proposals: Proposal[]
  id: Guid
  title: string
  description: string
  proposerAvatarId: Guid
  status: string            // 'draft' | 'active' | 'passed' | 'rejected' | 'executed' | 'cancelled'
  votingStartAt: DateTime
  votingEndAt: DateTime
  timelockSeconds: int      // delay between passing and execution
  executionPayload: JsonObject?  // on-chain call data or OAPP action
  votesFor: decimal
  votesAgainst: decimal
  votesAbstain: decimal
  quorumThreshold: decimal  // min % of supply that must vote
  passingThreshold: decimal // min % of votes that must be 'for'
  votes: Vote[]
    avatarId: Guid
    choice: string          // 'for' | 'against' | 'abstain'
    weight: decimal         // token balance at snapshot
    timestamp: DateTime
treasury: TreasuryBalance[]
  tokenId: Guid
  balance: decimal
quorumThreshold: decimal
passingThreshold: decimal
createdAt: DateTime
```

**Operations:**
- `CreateProposal(proposal) → OASISResult<Proposal>`
- `Vote(proposalId, avatarId, choice) → OASISResult<Vote>`
- `GetVotingPower(avatarId, proposalId) → OASISResult<decimal>` (snapshot at voting start)
- `ExecuteProposal(proposalId) → OASISResult<bool>` (only after timelock passes)
- `CancelProposal(proposalId) → OASISResult<bool>` (proposer or admin only)
- `GetProposals(status?, pageToken) → OASISResult<Page<Proposal>>`
- `GetTreasury(daoId) → OASISResult<TreasuryBalance[]>`
- `DelegatePower(fromAvatarId, toAvatarId) → OASISResult<bool>`

**Events emitted:**
- `dao.proposal_created` → triggers `NotificationHolon.send` to all members
- `dao.proposal_passed` → triggers timelock countdown, `NotificationHolon.send`
- `dao.proposal_executed` → triggers `ActivityFeedHolon.log`
- `dao.vote_cast` → triggers `ActivityFeedHolon.log`

**STAR scaffolding note:** On Solana, use SPL Governance. On EVM, use OpenZeppelin Governor. The `DAOHolon` wraps the chain-specific SDK behind the standard `OASISResult<T>` interface.

---

## Tier 10 — Marketplace & Time-Economics

### 30. `MarketplaceListingHolon`

**Purpose:** Buy/sell listings for any holon type (NFTs, tokens, services, physical goods). Handles offers, price negotiation, and escrow trigger.

**Schema:**
```
id: Guid
sellerAvatarId: Guid
itemHolonId: Guid           // NFTHolon, TokenHolon, ServiceHolon, etc.
itemHolonType: string
title: string
description: string
imageUrl: string
askPrice: decimal
currency: string            // 'SOL' | 'ETH' | 'USD' | 'OASIS_TOKEN'
status: string              // 'active' | 'sold' | 'cancelled' | 'expired'
buyerAvatarId: Guid?
offers: Offer[]
  id: Guid
  buyerAvatarId: Guid
  offerPrice: decimal
  message: string?
  status: string            // 'pending' | 'accepted' | 'rejected' | 'withdrawn'
  expiresAt: DateTime
  createdAt: DateTime
expiresAt: DateTime?
viewCount: int
createdAt: DateTime
soldAt: DateTime?
```

**Operations:**
- `CreateListing(listing) → OASISResult<MarketplaceListingHolon>`
- `UpdateListing(listingId, fields) → OASISResult<MarketplaceListingHolon>`
- `CancelListing(listingId) → OASISResult<bool>`
- `MakeOffer(listingId, price, message?) → OASISResult<Offer>`
- `AcceptOffer(offerId) → OASISResult<bool>` (triggers escrow/transfer)
- `RejectOffer(offerId) → OASISResult<bool>`
- `BuyNow(listingId, buyerAvatarId) → OASISResult<PaymentHolon>`
- `GetListings(filters, pageToken) → OASISResult<Page<MarketplaceListingHolon>>`
- `GetListingsBySeller(avatarId) → OASISResult<Page<MarketplaceListingHolon>>`

**Events emitted:**
- `marketplace.offer_received` → triggers `NotificationHolon.send` to seller
- `marketplace.sold` → triggers `NFTHolon.transfer`, `PaymentHolon.complete`

---

### 31. `AuctionHolon`

**Purpose:** Timed auctions with bid history, reserve prices, and automatic settlement. Supports English (ascending), Dutch (descending), and sealed-bid formats.

**Schema:**
```
id: Guid
sellerAvatarId: Guid
itemHolonId: Guid
itemHolonType: string
auctionType: string         // 'english' | 'dutch' | 'sealed_bid'
startPrice: decimal
reservePrice: decimal?      // hidden minimum acceptable price
currentBid: decimal
currentBidderAvatarId: Guid?
currency: string
bids: Bid[]
  id: Guid
  bidderAvatarId: Guid
  amount: decimal
  timestamp: DateTime
  isWinning: bool
startAt: DateTime
endAt: DateTime
status: string              // 'upcoming' | 'live' | 'ended' | 'settled' | 'cancelled'
autoExtendOnBid: bool       // extend by N minutes if bid placed in final window
autoExtendMinutes: int
winnerAvatarId: Guid?
finalPrice: decimal?
settledAt: DateTime?
```

**Operations:**
- `CreateAuction(auction) → OASISResult<AuctionHolon>`
- `PlaceBid(auctionId, avatarId, amount) → OASISResult<Bid>`
- `GetAuction(auctionId) → OASISResult<AuctionHolon>`
- `GetBidHistory(auctionId) → OASISResult<Bid[]>`
- `Cancel(auctionId) → OASISResult<bool>`
- `Settle(auctionId) → OASISResult<bool>` (auto-called at endAt; transfers item + payment)
- `GetActive(pageToken) → OASISResult<Page<AuctionHolon>>`

**Events emitted:**
- `auction.outbid` → triggers `NotificationHolon.send` to previous bidder
- `auction.ending_soon` → triggers `NotificationHolon.send` to watchers and current bidder
- `auction.settled` → triggers `NFTHolon.transfer`, `PaymentHolon.complete`

---

### 32. `TimeLockHolon`

**Purpose:** Time-gated and condition-gated access to content, tokens, or any holon. Powers vesting schedules, reveal mechanics (NFT collections), time-locked rewards, and embargoed announcements.

**Schema:**
```
id: Guid
ownerAvatarId: Guid
type: string                // 'time' | 'block_height' | 'condition' | 'multi'
targetHolonId: Guid         // the thing being locked
targetHolonType: string
unlocksAt: DateTime?        // for time-based locks
unlockBlockHeight: int?     // for chain-based locks
condition: LockCondition?   // { type: 'karma_threshold', value: 500 } etc.
isUnlocked: bool
unlockedAt: DateTime?
unlockedByAvatarId: Guid?
payload: JsonObject?        // content/data revealed on unlock (for embargoes)
notifyOnUnlock: Guid[]      // avatarIds to notify
chain: string?              // if on-chain, which chain
createdAt: DateTime
```

**Operations:**
- `Create(lock) → OASISResult<TimeLockHolon>`
- `CheckUnlock(timeLockId, avatarId?) → OASISResult<bool>` (evaluates conditions)
- `ForceUnlock(timeLockId) → OASISResult<bool>` (admin/owner only)
- `GetLockedContent(timeLockId, avatarId) → OASISResult<JsonObject?>` (returns payload if unlocked, null if not)
- `GetPendingLocks(pageToken) → OASISResult<Page<TimeLockHolon>>`
- `GetUnlockedBy(avatarId) → OASISResult<Page<TimeLockHolon>>`

**Events emitted:**
- `timelock.unlocked` → triggers `NotificationHolon.send` to `notifyOnUnlock` list, `FeedHolon.append`

**Use cases:** NFT reveal (hidden metadata until mint date), token vesting (founder allocation unlocks over 12 months), time-locked quest rewards, embargoed announcements.

---

## Tier 11 — Scheduling

### 33. `BookingHolon`

**Purpose:** Appointments, reservations, and availability slots for services, venues, or people. Essential for gyms, personal trainers, event spaces, coaching, and any time-based service OAPP.

**Schema:**
```
id: Guid
providerAvatarId: Guid      // the person/business being booked
customerAvatarId: Guid
serviceId: Guid?            // optional ServiceHolon reference
title: string
description: string?
startAt: DateTime
endAt: DateTime
timezone: string
status: string              // 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
location: string?           // address or virtual URL
notes: string?
price: decimal?
currency: string?
paymentStatus: string?      // 'unpaid' | 'paid' | 'refunded'
paymentHolonId: Guid?
reminderSentAt: DateTime?
cancelledBy: string?        // 'provider' | 'customer'
cancellationReason: string?
createdAt: DateTime
```

**Availability schema** (separate, per-provider):
```
availabilitySlots: Slot[]
  dayOfWeek: int            // 0=Sun, 6=Sat
  startTime: string         // 'HH:mm'
  endTime: string
  slotDurationMinutes: int
  maxConcurrent: int        // 1 for 1:1, N for group sessions
blackoutDates: DateTime[]
bookingWindowDays: int      // how far ahead customers can book
```

**Operations:**
- `GetAvailableSlots(providerAvatarId, date, serviceId?) → OASISResult<Slot[]>`
- `Book(booking) → OASISResult<BookingHolon>`
- `Confirm(bookingId) → OASISResult<bool>`
- `Cancel(bookingId, reason) → OASISResult<bool>`
- `Complete(bookingId) → OASISResult<bool>` (triggers review prompt)
- `Reschedule(bookingId, newStartAt) → OASISResult<BookingHolon>`
- `GetUpcoming(avatarId, role) → OASISResult<BookingHolon[]>` (role: 'customer' | 'provider')
- `SetAvailability(providerAvatarId, availability) → OASISResult<bool>`

**Events emitted:**
- `booking.confirmed` → triggers `NotificationHolon.send` to both parties
- `booking.reminder` → triggers `NotificationHolon.send` 24h and 1h before
- `booking.completed` → triggers `ReputationHolon.prompt`, `KarmaHolon.award`
- `booking.cancelled` → triggers `NotificationHolon.send`, refund if applicable

---

## Tier 12 — AI & Agents

### 34. `AIMemoryHolon`

**Purpose:** Persistent, searchable memory for an AI agent tied to an OASIS avatar. Stores conversation history, learned user preferences, agent goals, and contextual knowledge so agents can maintain continuity across sessions rather than starting blank every time.

**Why it belongs in STARNET:** OASIS-native AI agents (including the OASIS IDE agent) need persistent identity and memory that survives sessions. This holon is what makes an AI agent a first-class OASIS citizen — it has a wallet, karma, credentials, and now memory.

**Schema:**
```
id: Guid
agentAvatarId: Guid         // the AI agent's OASIS avatar
ownerAvatarId: Guid         // the human who owns/controls this agent
memoryType: string          // 'episodic' | 'semantic' | 'procedural' | 'working'
entries: MemoryEntry[]
  id: Guid
  type: string              // 'conversation' | 'preference' | 'fact' | 'goal' | 'skill'
  content: string           // the memory content (natural language or structured)
  embedding: float[]?       // vector embedding for semantic search
  importance: float         // 0.0–1.0, used for memory pruning
  source: string            // 'user_statement' | 'agent_inference' | 'tool_result'
  sessionId: string?        // which conversation this came from
  createdAt: DateTime
  lastAccessedAt: DateTime
  accessCount: int
  expiresAt: DateTime?      // for working/short-term memory
goals: AgentGoal[]
  id: Guid
  description: string
  status: string            // 'active' | 'paused' | 'complete' | 'abandoned'
  priority: int
  progress: float
  createdAt: DateTime
workspaceContext: JsonObject  // current project/workspace the agent is focused on
totalTokensStored: int
maxTokenBudget: int
lastActiveAt: DateTime
```

**Operations:**
- `Remember(agentAvatarId, entry) → OASISResult<MemoryEntry>`
- `Recall(agentAvatarId, query, limit, type?) → OASISResult<MemoryEntry[]>` (semantic search over embeddings)
- `Forget(entryId) → OASISResult<bool>` (user-directed deletion)
- `ForgetAll(agentAvatarId, type?) → OASISResult<bool>` (GDPR compliance)
- `GetContext(agentAvatarId, sessionId) → OASISResult<AIMemoryHolon>` (load relevant memories for a session)
- `SetGoal(agentAvatarId, goal) → OASISResult<AgentGoal>`
- `UpdateGoalProgress(goalId, progress) → OASISResult<AgentGoal>`
- `Prune(agentAvatarId) → OASISResult<int>` (removes low-importance expired entries)
- `ExportMemory(agentAvatarId) → OASISResult<JsonObject>` (GDPR data export)

**Events emitted:**
- `ai_memory.goal_complete` → triggers `NotificationHolon.send` to owner
- `ai_memory.context_loaded` → internal signal, fires at session start

**STAR scaffolding note:** Embeddings should use a configurable embedding model (OpenAI `text-embedding-3-small` by default; swap adapter without changing schema). Semantic search via cosine similarity on stored `float[]` vectors or a dedicated vector store (pgvector, Qdrant, Pinecone).

---

## Tier 13 — Utility & Integration

### 35. `WebhookHolon`

**Purpose:** Outbound webhooks — any holon event can trigger a call to an external HTTP endpoint. Makes every OAPP natively integrable with Zapier, Slack, Discord, custom backends, or any third-party service without writing glue code.

**Schema:**
```
id: Guid
ownerAvatarId: Guid
name: string
targetUrl: string
method: string              // 'POST' | 'PUT'
headers: JsonObject         // e.g. { Authorization: 'Bearer ...' }
subscribedEvents: string[]  // e.g. ['quest.complete', 'nft.minted', 'payment.complete']
isActive: bool
secretKey: string           // HMAC signing secret (sent as X-OASIS-Signature header)
deliveries: WebhookDelivery[]
  id: Guid
  event: string
  payloadJson: string
  statusCode: int?
  responseBody: string?
  attemptCount: int
  succeededAt: DateTime?
  failedAt: DateTime?
  nextRetryAt: DateTime?
retryPolicy: string         // 'none' | 'exponential' | 'fixed'
maxRetries: int
createdAt: DateTime
```

**Operations:**
- `Create(webhook) → OASISResult<WebhookHolon>`
- `Update(webhookId, fields) → OASISResult<WebhookHolon>`
- `Delete(webhookId) → OASISResult<bool>`
- `Activate(webhookId) → OASISResult<bool>`
- `Pause(webhookId) → OASISResult<bool>`
- `GetDeliveries(webhookId, pageToken) → OASISResult<Page<WebhookDelivery>>`
- `Retry(deliveryId) → OASISResult<bool>`
- `Test(webhookId) → OASISResult<WebhookDelivery>` (sends a test ping)
- `GetAll(ownerAvatarId) → OASISResult<WebhookHolon[]>`

---

### 36. `PollHolon`

**Purpose:** Quick polls, surveys, and opinion gathering embedded in any context (posts, quests, events, group chats). Distinct from `DAOHolon` — polls are lightweight and non-binding.

**Schema:**
```
id: Guid
creatorAvatarId: Guid
question: string
options: PollOption[]
  id: Guid
  text: string
  voteCount: int
  percentage: float         // derived
allowMultipleChoices: bool
isAnonymous: bool
showResultsBefore: bool     // show live results before voting
endsAt: DateTime?
status: string              // 'active' | 'ended'
totalVotes: int
votes: PollVote[]           // only stored if not anonymous
  avatarId: Guid
  optionIds: Guid[]
  votedAt: DateTime
contextHolonId: Guid?       // the post/event/chat this poll is attached to
contextHolonType: string?
createdAt: DateTime
```

**Operations:**
- `Create(poll) → OASISResult<PollHolon>`
- `Vote(pollId, avatarId, optionIds) → OASISResult<PollHolon>`
- `GetResults(pollId) → OASISResult<PollHolon>`
- `End(pollId) → OASISResult<PollHolon>`
- `GetPolls(contextHolonId) → OASISResult<PollHolon[]>`

**Events emitted:**
- `poll.ended` → triggers `NotificationHolon.send` to creator with results summary
- `poll.vote_cast` → triggers live result update (websocket push)

---

### 37. `InventoryHolon`

**Purpose:** Item and equipment management for games, metaverse spaces, and physical asset tracking. Tracks what an avatar owns, equips, uses, and trades. Distinct from `NFTHolon` (which tracks on-chain ownership) — inventory is about in-app item state.

**Schema:**
```
id: Guid
ownerAvatarId: Guid
items: InventoryItem[]
  id: Guid
  itemKey: string           // game-defined item type: 'iron_sword' | 'health_potion'
  name: string
  description: string
  imageUrl: string
  category: string          // 'weapon' | 'armour' | 'consumable' | 'cosmetic' | 'tool'
  rarity: string            // 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  quantity: int
  isEquipped: bool
  equippedSlot: string?     // 'primary_hand' | 'head' | 'chest' | etc.
  attributes: JsonObject    // { attack: 45, durability: 80, level_req: 10 }
  nftHolonId: Guid?         // linked NFTHolon if this item is on-chain
  isTransferable: bool
  isTradeable: bool
  acquiredAt: DateTime
  expiresAt: DateTime?      // for time-limited items
maxCapacity: int            // total item slots
equippedLoadout: JsonObject // quick-save of current equipped set
updatedAt: DateTime
```

**Operations:**
- `GetInventory(avatarId) → OASISResult<InventoryHolon>`
- `AddItem(avatarId, item) → OASISResult<InventoryItem>`
- `RemoveItem(avatarId, itemId, quantity?) → OASISResult<bool>`
- `EquipItem(avatarId, itemId, slot) → OASISResult<InventoryHolon>`
- `UnequipItem(avatarId, itemId) → OASISResult<InventoryHolon>`
- `UseItem(avatarId, itemId) → OASISResult<JsonObject>` (returns effect payload; decrements consumable)
- `TradeItem(fromAvatarId, toAvatarId, itemId, quantity) → OASISResult<bool>`
- `SaveLoadout(avatarId, loadoutName) → OASISResult<bool>`
- `RestoreLoadout(avatarId, loadoutName) → OASISResult<InventoryHolon>`

**Events emitted:**
- `inventory.item_acquired` → triggers `NotificationHolon.send`, `AchievementHolon.check`
- `inventory.item_equipped` → triggers `ActivityFeedHolon.log`

**STAR/Unity note:** This holon is the bridge between Unity game world items and the OASIS graph. A sword picked up in ODOOM is an `InventoryItem` here, optionally minted as an `NFTHolon` for cross-game portability.

---

### 38. `WaitlistHolon`

**Purpose:** Sign-up queues, invite codes, and early-access management for launches, limited drops, beta access, or capacity-limited experiences.

**Schema:**
```
id: Guid
ownerAvatarId: Guid
name: string
description: string
type: string                // 'fcfs' | 'lottery' | 'referral_weighted' | 'invite_only'
status: string              // 'open' | 'closed' | 'inviting' | 'complete'
signups: WaitlistEntry[]
  id: Guid
  avatarId: Guid
  position: int
  referralCode: string      // this user's shareable code
  referredBy: Guid?
  referralCount: int
  status: string            // 'waiting' | 'invited' | 'joined' | 'expired'
  signedUpAt: DateTime
  invitedAt: DateTime?
  joinedAt: DateTime?
inviteCodes: string[]       // batch of one-time access codes
maxCapacity: int?
currentCount: int
referralBonus: int?         // positions moved up per referral
requiresApproval: bool
closesAt: DateTime?
createdAt: DateTime
```

**Operations:**
- `Create(waitlist) → OASISResult<WaitlistHolon>`
- `Join(waitlistId, avatarId, referralCode?) → OASISResult<WaitlistEntry>`
- `GetPosition(waitlistId, avatarId) → OASISResult<int>`
- `InviteNext(waitlistId, count) → OASISResult<WaitlistEntry[]>` (moves top N to 'invited')
- `InviteSpecific(waitlistId, avatarId) → OASISResult<bool>`
- `GenerateInviteCodes(waitlistId, count) → OASISResult<string[]>`
- `GetStats(waitlistId) → OASISResult<JsonObject>` (total, invited, joined, referral tree)
- `Close(waitlistId) → OASISResult<bool>`

**Events emitted:**
- `waitlist.invited` → triggers `NotificationHolon.send` with access link/code
- `waitlist.position_improved` → triggers `NotificationHolon.send` (referral milestone)

---

## Holon Connection Map

The following edges are the most commonly wired connections between holons (shown as `Source → Target : trigger`):

```
AuthHolon.registered          → UserProfileHolon.create
AuthHolon.wallet_linked       → WalletHolon.init
AuthHolon.login               → ActivityFeedHolon.log

QuestHolon.complete           → KarmaHolon.award
QuestHolon.complete           → AchievementHolon.check
QuestHolon.complete           → NotificationHolon.send
QuestHolon.complete           → NFTHolon.mint           (if NFT reward)

GeoHolon.checkin              → QuestHolon.completeObjective
GeoHolon.checkin              → KarmaHolon.award
GeoHolon.checkin              → NFTHolon.mint           (if geo-triggered)

KarmaHolon.level_up           → AchievementHolon.check
KarmaHolon.level_up           → NotificationHolon.send

AchievementHolon.unlocked     → NotificationHolon.send
AchievementHolon.unlocked     → NFTHolon.mint           (if badge is NFT)
AchievementHolon.unlocked     → KarmaHolon.award

PaymentHolon.complete         → TokenHolon.transfer
PaymentHolon.complete         → NotificationHolon.send
PaymentHolon.complete         → ActivityFeedHolon.log

SocialGraphHolon.followed     → NotificationHolon.send
SocialGraphHolon.followed     → FeedHolon.refresh

PostHolon.created             → FeedHolon.append
PostHolon.liked               → KarmaHolon.award        (author)
PostHolon.liked               → NotificationHolon.send  (author)

EventHolon.rsvp               → NotificationHolon.send  (reminder)
EventHolon.live               → NotificationHolon.send  (all RSVPs)

CredentialHolon.issued        → NotificationHolon.send
CredentialHolon.verified      → AchievementHolon.check

ReputationHolon.review_submitted → NotificationHolon.send
ReputationHolon.trust_level_changed → FeedHolon.append

ModerationHolon.removed       → NotificationHolon.send  (to author)

DAOHolon.proposal_passed      → NotificationHolon.send  (all members)
DAOHolon.proposal_executed    → ActivityFeedHolon.log

TeamHolon.member_joined       → NotificationHolon.send
TeamHolon.member_joined       → ActivityFeedHolon.log

MarketplaceListingHolon.sold  → NFTHolon.transfer
MarketplaceListingHolon.sold  → PaymentHolon.complete
MarketplaceListingHolon.offer_received → NotificationHolon.send

AuctionHolon.outbid           → NotificationHolon.send  (to previous bidder)
AuctionHolon.settled          → NFTHolon.transfer
AuctionHolon.settled          → PaymentHolon.complete

TimeLockHolon.unlocked        → NotificationHolon.send
TimeLockHolon.unlocked        → FeedHolon.append

BookingHolon.confirmed        → NotificationHolon.send  (both parties)
BookingHolon.completed        → ReputationHolon.prompt
BookingHolon.completed        → KarmaHolon.award

InventoryHolon.item_acquired  → AchievementHolon.check
InventoryHolon.item_acquired  → NotificationHolon.send

WaitlistHolon.invited         → NotificationHolon.send

PollHolon.ended               → NotificationHolon.send  (creator)
```

---

## Priority for Agent Team

| Tier | Holons | Rationale |
|------|--------|-----------|
| **P0 — Build first** | `AuthHolon`, `UserProfileHolon`, `NotificationHolon`, `FeedHolon`, `KarmaHolon`, `QuestHolon` | Present in every OAPP; required for any demo |
| **P1 — Build next** | `SocialGraphHolon`, `ChatHolon`, `GeoHolon`, `NFTHolon`, `WalletHolon`, `AchievementHolon` | Core of OASIS differentiation — geo, NFT, social |
| **P2 — Build after** | `PostHolon`, `CommentHolon`, `ActivityFeedHolon`, `SearchHolon`, `LeaderboardHolon`, `EventHolon` | Needed for richer OAPPs; reuses P0/P1 holons heavily |
| **P3 — Build later** | `PaymentHolon`, `TokenHolon`, `FileStorageHolon`, `FormHolon`, `SettingsHolon`, `MediaHolon` | Commerce, content, and polish — important but not MVP-blocking |
| **P4 — Extended (new)** | `CredentialHolon`, `ReputationHolon`, `TeamHolon`, `DAOHolon`, `MarketplaceListingHolon`, `InventoryHolon`, `AIMemoryHolon` | Trust, governance, marketplace, game world — OASIS differentiators beyond MVP |
| **P5 — Utility (new)** | `AuctionHolon`, `TimeLockHolon`, `BookingHolon`, `ModerationHolon`, `WebhookHolon`, `PollHolon`, `WaitlistHolon` | Scheduling, safety, integration, and launch mechanics — needed for production OAPPs |

---

## STAR Scaffolding Notes (for agent team)

Each holon should be implemented as:

1. **A C# class** inheriting from `HolonBase` (in `NextGenSoftware.OASIS.API.Core.Holons`)
2. **A Manager class** (`AuthHolonManager`, `QuestHolonManager`, etc.) containing the `OASISResult<T>`-returning operations listed above
3. **An MCP tool** registered in `MCP/src/tools/` so the IDE agent can invoke it directly (following the pattern in `MCP/src/tools/starTools.ts`)
4. **A STARNET template** for holons that represent full app modules (quests, social graph, geo) — publish these so they appear in `star_list_holons`
5. **Event routing** via the OASIS `Messenger` / event bus rather than direct manager-to-manager calls

When referencing identity, always use `AvatarId` from the OASIS Avatar — do not create parallel user tables.

For cross-framework rendering:
- **Web (React/Next.js):** Generate a TypeScript client SDK from the MCP tool definitions
- **Mobile (Flutter/React Native):** Same REST endpoints, generate a typed Dart/TS client
- **Unity/C#:** Direct C# manager calls (no HTTP) — use the same manager classes

---

## Files for Agent Team to Read First

| File | Why |
|------|-----|
| `Docs/Devs/AGENT_Root_Cause_No_Fallbacks.md` | No shims, no fallbacks — invariants only |
| `OASIS Architecture/NextGenSoftware.OASIS.API.Core/Holons/HolonBase.cs` | Base class all holons extend |
| `STAR ODK/NextGenSoftware.OASIS.STAR.CLI/Program.cs` | STAR CLI command routing |
| `MCP/src/tools/starTools.ts` | Example MCP tool registration |
| `OASIS-IDE/docs/recipes/demo-flows.md` | Example end-to-end flows |
