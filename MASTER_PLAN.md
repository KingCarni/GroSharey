# GroSharey Master Plan

## Vision

Build the smartest household grocery companion: a shared grocery workflow that becomes more useful with every shopping trip and receipt.

## Core promise

GroSharey helps households:

- remember what to buy;
- coordinate shopping in real time;
- retain receipts and purchase history;
- understand grocery spending;
- estimate local prices;
- make smarter shopping decisions.

## Product phases

### Phase 1 — Shared Grocery MVP

- Account creation and sign-in
- Household creation and invitations
- Shared grocery lists
- Grocery item details and categories
- Real-time synchronization
- Configurable notifications
- Going Shopping mode
- Household chat and item notes
- Seven-day trial
- CA$5/month for two users
- CA$3/month per additional active user
- Android APK testing workflow

### Phase 2 — Receipts, Pricing and Analytics

- Receipt photo capture and secure storage
- OCR extraction
- Structured receipt parsing
- Manual review and correction
- Searchable receipt archive
- Household price history
- Location-aware estimates
- Spending and purchase analytics
- Data export and deletion controls

### Phase 3 — Community Price Intelligence

- Explicit opt-in to anonymous price contribution
- De-identified price observations
- Product and store normalization
- Local geographic aggregation
- Freshness and confidence scoring
- Nearby store comparisons
- Price alerts
- Data quality and abuse prevention

### Phase 4 — Smart Shopping Assistant

- Recurring item reminders
- Likely-needed item suggestions
- Cross-store basket optimization
- Pantry tracking
- Meal-plan list generation
- Voice item entry
- Home-screen widgets
- Savings summaries
- Recommendation experiments and scaling controls

## Product decisions

### 2026-07-28

- Product name: GroSharey
- Mobile stack: React Native with Expo and TypeScript
- Initial platform: Android
- Trial length: seven days
- Base subscription: CA$5/month for two users
- Additional users: CA$3/month each
- Receipt contributions: anonymous and opt-in
- Local estimates should learn from eligible receipts across all users, not only within one household
- Precise household identity and receipt images must never appear in community pricing data
- Git workflow: keep it lightweight for a one-person project; use temporary branches for risky or substantial work rather than requiring one branch per ticket
- APKs should be versioned and include visible build environment information

## Technical direction

- Expo Router for mobile navigation
- Strict TypeScript and lint validation
- EAS Build for development and preview APKs
- GitHub Actions for pull-request validation
- Backend and database must support household isolation, auditability, soft deletion where appropriate, and future receipt/community pricing models
- Authorization must be enforced in the backend or database layer, not only in the client

## Current work

- GRO-5 — Initialize React Native/Expo mobile project
- GRO-6 — Configure APK build and tester distribution workflow
- GRO-7 — Design core database schema and access rules

## Parking lot

These ideas are valid but not current commitments:

- Barcode scanning
- Flyer and retailer integrations
- Coupons
- Alexa or Google Assistant integration
- Wearable support
- Shared meal planning
- Recipe imports
- Loyalty-card integrations
- iOS release
- Web dashboard

## Working principles

- Build the smallest complete user journey before adding breadth
- Keep basic list use fast and uncomplicated
- Treat privacy and data ownership as product features
- Never present estimated prices as guaranteed inventory or live pricing
- Measure OCR, AI, storage and notification costs from the beginning
- Keep Jira as the implementation backlog and this file as the durable product memory
