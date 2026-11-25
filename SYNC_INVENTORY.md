# EdgeLedger Sync & Sign-In Inventory (Step 0 Baseline)

Generated prior to implementing the sign-in, transport adapter, IndexedDB outbox/cache, and sync engine.

---

## 1. Stack Detection

| Layer | Detected Implementation | Evidence |
| :--- | :--- | :--- |
| **Framework** | Next.js `15.1.7` (App Router), React `19.0.0`, TypeScript `5.7.3` | `package.json`, `next.config.ts`, `src/app/` |
| **Router** | Next.js App Router (`next/navigation`: `usePathname`, `useRouter`, `Link`) | `src/components/layout/Header.tsx`, `Sidebar.tsx`, pages under `src/app/*/page.tsx` |
| **Styling / Tokens** | Tailwind CSS `3.4.17` + Tidewater CSS custom properties (`--tw-*` aliased to `--bg`, `--tile`, `--ink-3`, `--gain`, `--warn`, `--loss`, `--focus`, etc.) | `src/app/globals.css`, `tailwind.config.ts` |
| **State Library** | React Context (`TradingProvider` / `useTrading()`) | `src/context/TradingContext.tsx`, `src/app/layout.tsx` |
| **Backend / Persistence** | Next.js Route Handlers (`/api/v1/*`, rewritten from `/v1/*`), server in-memory `AccountRepository`, optional Supabase PostgreSQL (`@supabase/supabase-js` `2.49.1`, `@supabase/ssr` `0.5.2`), client fallback `localStorage` | `src/app/api/v1/**`, `src/lib/data/accountRepository.ts`, `src/lib/supabase/service.ts`, `.env.local` (Supabase unconfigured -> local fallback active) |
| **Auth Provider** | None active for user sessions. `supabase/migrations/001_initial_schema.sql` defines `auth.users` + RLS, and `supabase/client.ts` enables `persistSession: true`, but no sign-in routes, session state machine, or auth UI exist. Hardcoded `'user-default'` / `'00000000-0000-0000-0000-000000000000'` is used across repos/services. Note: Overview/Header has a biometric Touch ID P&L blur toggle (`isPnlHidden`) which gates P&L visibility in UI only. | `src/lib/supabase/client.ts`, `src/context/TradingContext.tsx`, `src/app/page.tsx`, `src/components/layout/Header.tsx` |
| **Test Runner** | Vitest `3.0.6` (`environment: 'node'`, `@/* -> ./src/*`) | `vitest.config.ts`, `package.json` |

---

## 2. Existing Data-Fetch Layer Inventory

### 2.1 Client HTTP `fetch()` Call Sites

| File | Function / Handler | Signature / Request | Return Shape |
| :--- | :--- | :--- | :--- |
| `src/components/accounts/AddAccountForm.tsx` | `handleSubmit` (line 259) | `fetch('/api/v1/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': string }, body: JSON.stringify(payload) })` | JSON `{ account: PersonalizedAccount, ruleSet: RuleSet, gateState: GateState }` (201) or RFC 7807 `ProblemDetails` with `invalid_params` (4xx) |
| `src/app/settings/page.tsx` | `handleSaveSupabaseConfig` (line 66) | `fetch('/api/v1/config/supabase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supabaseUrl, supabaseAnonKey, supabaseServiceKey }) })` | JSON `{ success: boolean, message?: string, error?: string, latencyMs?: number, schemaStatus?: string }` |
| `src/app/settings/page.tsx` | `handleTestConnection` (line 116) | `fetch('/api/v1/health')` | JSON `{ status: 'ok', timestamp: string, app: {...}, backend: {...}, supabase: { configured, connected, latencyMs, accountsCount, tradesCount, message } }` |

### 2.2 Supabase Client & Data Service (`src/lib/supabase/*`)

| File | Symbol | Signature | Return Shape |
| :--- | :--- | :--- | :--- |
| `src/lib/supabase/client.ts` | `isSupabaseConfigured` | `const isSupabaseConfigured: boolean` | `boolean` |
| `src/lib/supabase/client.ts` | `supabase` | `const supabase: SupabaseClient \| null` | `SupabaseClient \| null` |
| `src/lib/supabase/client.ts` | `getSupabaseDetails()` | `() => { configured, url, maskedKey, environment, baseCurrency, decimalPrecision, riskCheckIntervalMs, enableDemoData, enableWorkedFixtures }` | Summary object (non-secret) |
| `src/lib/supabase/client.ts` | `testSupabaseConnection()` | `() => Promise<{ success: boolean; message: string; latencyMs?: number }>` | Connection health status |
| `src/lib/supabase/server.ts` | `createServerSupabaseClient()` | `() => SupabaseClient \| null` | Server Supabase client (`persistSession: false`) |
| `src/lib/supabase/service.ts` | `SupabaseService.fetchAccounts()` | `() => Promise<TradingAccount[] \| null>` | `TradingAccount[] \| null` |
| `src/lib/supabase/service.ts` | `SupabaseService.fetchTrades()` | `() => Promise<Trade[] \| null>` | `Trade[] \| null` |
| `src/lib/supabase/service.ts` | `SupabaseService.saveTrade(trade)` | `(trade: Trade) => Promise<boolean>` | `boolean` |
| `src/lib/supabase/service.ts` | `SupabaseService.saveAccount(account)` | `(account: TradingAccount) => Promise<boolean>` | `boolean` |
| `src/lib/supabase/service.ts` | `SupabaseService.fetchStrategies()` | `() => Promise<Strategy[] \| null>` | `Strategy[] \| null` |
| `src/lib/supabase/service.ts` | `SupabaseService.saveStrategy(strategy)` | `(strategy: Strategy) => Promise<boolean>` | `boolean` |
| `src/lib/supabase/service.ts` | `SupabaseService.fetchJournalEntries()` | `() => Promise<JournalEntry[] \| null>` | `JournalEntry[] \| null` |
| `src/lib/supabase/service.ts` | `SupabaseService.saveJournalEntry(entry)` | `(entry: JournalEntry) => Promise<boolean>` | `boolean` |
| `src/lib/supabase/service.ts` | `SupabaseService.fetchAlerts()` | `() => Promise<RiskAlert[] \| null>` | `RiskAlert[] \| null` |
| `src/lib/supabase/service.ts` | `SupabaseService.saveAlert(alert)` | `(alert: RiskAlert) => Promise<boolean>` | `boolean` |
| `src/lib/supabase/service.ts` | `SupabaseService.applyTombstones(tombstones)` | `(tombstones: SyncTombstone[]) => Promise<number>` | Count deleted |
| `src/lib/supabase/service.ts` | `SupabaseService.syncLocalToCloud(...)` | `(accounts, trades, strategies?, journalEntries?, alerts?) => Promise<{ success, accountsSynced, tradesSynced, strategiesSynced, journalSynced, alertsSynced, error? }>` | Bulk delta sync summary |
| `src/lib/supabase/service.ts` | `SupabaseService.checkHealth()` | `() => Promise<{ connected, latencyMs, accountsCount, tradesCount, message }>` | Health check summary |
| `src/lib/supabase/service.ts` | `SupabaseService.delete{Trade,Account,Rule,JournalEntry,Strategy,Alert}(id)` | `(id: string) => Promise<boolean>` | `boolean` |

### 2.3 Existing Sync Helpers & Cache Keys

| File | Symbol / Key | Signature / Purpose | Return Shape |
| :--- | :--- | :--- | :--- |
| `src/lib/sync/syncEngine.ts` | `TOMBSTONE_STORAGE_KEY` (`'edgeledger_sync_tombstones'`) | `localStorage` delete tombstone list | `SyncTombstone[]` |
| `src/lib/sync/syncEngine.ts` | `OUTBOX_STORAGE_KEY` (`'edgeledger_sync_queue'`) | `localStorage` pending mutations queue | `OutboxMutation[]` |
| `src/lib/sync/syncEngine.ts` | `reconcileEntityLists<T>(options)` | `(options: ReconcileOptions<T>) => ReconcileResult<T>` | `{ merged, toPushToCloud, toDeleteFromCloud, pulledCount, conflictResolutions }` |
| `src/lib/sync/syncEngine.ts` | `mergeAccount(local, remote)` | `(local: TradingAccount, remote: TradingAccount) => { item, changedFromLocal, shouldPush }` | Merged account + flags |
| `src/lib/sync/syncEngine.ts` | `mergeTrade(local, remote)` | `(local: Trade, remote: Trade) => { item, changedFromLocal, shouldPush }` | Merged trade + flags |
| `src/lib/sync/syncEngine.ts` | `loadTombstones`, `saveTombstones`, `recordTombstone` | Local tombstone CRUD | `SyncTombstone[]` / `void` |
| `src/lib/sync/syncEngine.ts` | `loadOutbox`, `saveOutbox`, `enqueueMutation`, `removeOutboxItems`, `clearOutbox` | Legacy outbox CRUD | `OutboxMutation[]` / `void` |
| `src/context/TradingContext.tsx` | `STORAGE_KEY` (`'edgeledger_v2_store'`) | `localStorage` client cache for `{ accounts, trades, strategies, journalEntries, riskAlerts }` | JSON snapshot |
| `src/context/TradingContext.tsx` | `TradingProvider` / `useTrading()` | `persistUpsertToCloud`, `persistDeleteToCloud`, `runNonOverridingSync`, `syncWithCloud`, plus CRUD actions (`addAccount`, `updateAccount`, `deleteAccount`, `addTrade`, `updateTrade`, `deleteTrade`, `executePartialClose`, `addStrategy`, `updateStrategy`, `deleteStrategy`, `addJournalEntry`, `updateJournalEntry`, `deleteJournalEntry`, `dismissAlert`, `updateRule`, `addRule`, `toggleRule`, `deleteRule`, `importTrades`, `resetToDemoData`, `clearDemoData`, `clearAllUserData`) | `TradingContextType` |
| `src/components/layout/AppLayout.tsx` | `'edgeledger_theme'` | `localStorage` UI theme preference (`'dark' \| 'light'`) | `'dark' \| 'light'` |

### 2.4 Existing Backend API Route Handlers & Repository

| File | Endpoint / Symbol | Signature | Return Shape |
| :--- | :--- | :--- | :--- |
| `src/lib/data/accountRepository.ts` | `AccountRepository` | `getFirmTemplate`, `getAccount`, `getAllAccounts`, `getActiveRuleSet`, `getAllRuleSets`, `getGateState`, `createAccountWithRuleSet`, `updateAccount`, `deleteAccount`, `createRuleSetVersion`, `recordExecution`, `recordAuditEvent`, `getAuditEvents`, `executeDailyReset` (in-memory singleton `global.__edgeledger_repo_state__`) | Domain entities & gate states |
| `src/app/api/v1/accounts/route.ts` | `GET /api/v1/accounts`, `POST /api/v1/accounts` | NextRequest -> NextResponse | `{ accounts }` / `{ account, ruleSet, gateState }` |
| `src/app/api/v1/accounts/[id]/route.ts` | `GET / PATCH / DELETE /api/v1/accounts/[id]` | NextRequest -> NextResponse | `{ account, ruleSet, gateState }` / `{ success, deletedId, deletedFromCloud }` |
| `src/app/api/v1/accounts/[id]/gate/route.ts` | `GET /api/v1/accounts/[id]/gate` | NextRequest -> NextResponse | `GateState` |
| `src/app/api/v1/accounts/[id]/phase/route.ts` | `POST /api/v1/accounts/[id]/phase` | NextRequest -> NextResponse | `{ account, gateState }` |
| `src/app/api/v1/accounts/[id]/rulesets/route.ts` | `POST /api/v1/accounts/[id]/rulesets` | NextRequest -> NextResponse | `{ ruleSet, gateState }` |
| `src/app/api/v1/executions/route.ts` | `POST /api/v1/executions` | NextRequest -> NextResponse | `{ executionId, gateState }` or 423 ProblemDetails |
| `src/app/api/v1/trades/route.ts` | `GET /api/v1/trades`, `POST /api/v1/trades` | NextRequest -> NextResponse | `{ trades, total, source }` / `{ trade, persistedToCloud }` |
| `src/app/api/v1/trades/[id]/route.ts` | `DELETE /api/v1/trades/[id]` | NextRequest -> NextResponse | `{ success, deletedId, deletedFromCloud }` |
| `src/app/api/v1/sync/route.ts` | `POST /api/v1/sync` | Reconciles client snapshot with `SupabaseService` | Reconciled counts & entity snapshot |
| `src/app/api/v1/config/supabase/route.ts` | `GET / POST /api/v1/config/supabase` | Reads/writes `.env.local` Supabase creds | `{ configured, ... }` / `{ success, latencyMs, schemaStatus }` |
| `src/app/api/v1/health/route.ts` | `GET /api/v1/health` | Health + Supabase telemetry | `{ status, timestamp, app, backend, supabase }` |

---

## 3. Baseline SHA-256 Checksums (Before Changes)

| File | Baseline SHA-256 | Role | Injection Point Expected? |
| :--- | :--- | :--- | :--- |
| `src/lib/supabase/client.ts` | `65f75d197fd3220cea622a9df30ad3b6db23a88bd8f21f73cd834dc2763236cc` | Supabase browser client | **No** (unchanged) |
| `src/lib/supabase/server.ts` | `f560d732e9557b4b85d0237d94e012bc270478ebb134e3f40593a4eb3c39dcfe` | Supabase server client | **No** (unchanged) |
| `src/lib/supabase/service.ts` | `9c057de296f0a5f5de8b74670ce2f1b135a2a93b09678abb52a8d6fd2e70e65e` | Supabase CRUD service | **No** (unchanged) |
| `src/lib/sync/syncEngine.ts` | `9be33daf4ea4c616a32014881fcbe226643e82a0e30ce0b332eb4554bba38737` | Existing merge/reconcile engine | **No** (unchanged) |
| `src/lib/data/accountRepository.ts` | `c8d7f0acc7f4ecb759bcfaecd33afe708fffc8ae413404778ff248feb87aba28` | Server gate/account store | **No** (unchanged) |
| `src/components/accounts/AddAccountForm.tsx` | `2183b14c8774b1a01b0aaf076d7c423b248ffbb240496de21030dc0e6cf1e20a` | Provision account HTTP call | **No** (wrapped at root) |
| `src/app/settings/page.tsx` | `ad11456c43434a4c7ff75b132d4859fd1edfe1297a26d35733efaf01458287ca` | Config & health HTTP calls | **No** (wrapped at root) |
| `src/app/api/v1/accounts/route.ts` | `7412ff09f42791a27ffac7877679293b0e1cbf5815f19492c365f3d80a26cd4c` | Accounts API | **No** (unchanged) |
| `src/app/api/v1/accounts/[id]/route.ts` | `474f2d3176248af2f72318e4690e9dd073aec8753c40a49c9e4b178d4496f6e0` | Account item API | **No** (unchanged) |
| `src/app/api/v1/accounts/[id]/gate/route.ts` | `e003bea0586962ae9986bfa74221667d42e5616012c7d917defd6ba26c9aa7e9` | Gate state API | **No** (unchanged) |
| `src/app/api/v1/accounts/[id]/phase/route.ts` | `17a34f8d08c6251f7f8264aa4aff503c56013434b58800fc8412cacdcd7982db` | Phase transition API | **No** (unchanged) |
| `src/app/api/v1/accounts/[id]/rulesets/route.ts` | `c0fd20ac5c99154b1561e0c4e8757a2b776bf6058a82bd0a875a84c96566f73d` | RuleSet versioning API | **No** (unchanged) |
| `src/app/api/v1/config/supabase/route.ts` | `1e192bf3150b323640e2051f4e50f03e63e5463143c8c2ed89e1ae9db6455668` | Supabase config API | **No** (unchanged) |
| `src/app/api/v1/executions/route.ts` | `b2a38ae78aad62ad0c5ea06e63cbe8ce5d8125469387e3772c5368d051270219` | Execution gate API | **No** (unchanged) |
| `src/app/api/v1/health/route.ts` | `d010465a2dd9b0a0c04276e0e2a69e48e9999468dc9fcc9d44b260fd563cdb15` | Health endpoint | **No** (unchanged) |
| `src/app/api/v1/sync/route.ts` | `d36ec5cc0822ccabef3d27261c66ddc53a817512035c7742ea4008a9fc17d43a` | Legacy batch sync route | **No** (unchanged) |
| `src/app/api/v1/trades/route.ts` | `33cd03908faeee8dc5c0005110f88f07940c036b792135e7db0f5d1cf039036d` | Trades API | **No** (unchanged) |
| `src/app/api/v1/trades/[id]/route.ts` | `389b6b4031675b2e9909bf48cb5896aa295673541406e00aece2ce26b7ea03a1` | Trade delete API | **No** (unchanged) |
| `src/context/TradingContext.tsx` | `78a8cf7cdbc4d48b84cf76ac4602e2766d91554ca6396906c691aa9dc0659f77` | App state provider | **Yes** (minimal bridge hook injection for outbox enqueue + closed-trade append-only correction emission without modifying signatures/shapes) |
| `src/app/layout.tsx` | `72a870db790794bfd339e2b5f042353a60f84beb1ce3c8c936564bddfe03f958` | App root layout | **Yes** (install transport wrapper + Session/Sync provider at root) |
| `src/components/layout/Sidebar.tsx` | `c38eaa99dbc9718fabd4f68380dbe6b46c72ac65c26f1f024f990dcc5871da4c` | Sidebar layout component | **Yes** (replace `"TERMINAL SYNCED v1.0.4"` footer with live `<SyncStatusChip />`) |
| `src/components/layout/Header.tsx` | `03ed711b47619356a0ed619bccafc1df61e7b2d77037101fd542de992cbdd09a` | Top bar rendered on Overview/all pages | **Yes** (surface live `<SyncStatusChip />` + Auth/Lock/Conflict modal triggers in light & dark) |

---

## 4. Protocol & Adapter Mapping

- Existing endpoints do **not** implement `/auth/sign-in`, `/auth/refresh`, `/auth/sign-out`, `/sync/changes`, or `/sync/push`.
- We implement the assumed protocol directly on Next.js App Router (`/auth/sign-in`, `/auth/refresh`, `/auth/sign-out`, `/sync/changes`, `/sync/push`) with signed `httpOnly`, `Secure` (in HTTPS/production), `SameSite=Lax` cookies on the server and an in-memory sync change-log/version store that optionally delegates authentication to Supabase Auth when configured, while adapting seamlessly to the client's `SyncAdapter` interface (`src/lib/sync/syncProtocolAdapter.ts`).
- Existing `/api/v1/*` routes and `SupabaseService` / `TradingContext` fetch logic remain untouched; the root `installTransportAdapter()` wraps `window.fetch` cleanly to inject `credentials: 'include'` and single-flight 401 refresh-and-retry.

---

## 5. Post-Edit SHA-256 Verification & Exact Injection Points

Every untouched file in the fetch layer matches its baseline SHA-256 identically. Only the four documented injection points changed:

| File | Baseline SHA-256 | Post-Edit SHA-256 | Match? | Exact Changed Lines Summary |
| :--- | :--- | :--- | :--- | :--- |
| `src/lib/supabase/client.ts` | `65f75d19...36cc` | `65f75d197fd3220cea622a9df30ad3b6db23a88bd8f21f73cd834dc2763236cc` | **EXACT MATCH** | — |
| `src/lib/supabase/server.ts` | `f560d732...dcfe` | `f560d732e9557b4b85d0237d94e012bc270478ebb134e3f40593a4eb3c39dcfe` | **EXACT MATCH** | — |
| `src/lib/supabase/service.ts` | `9c057de2...e65e` | `9c057de296f0a5f5de8b74670ce2f1b135a2a93b09678abb52a8d6fd2e70e65e` | **EXACT MATCH** | — |
| `src/lib/sync/syncEngine.ts` | `9be33daf...8737` | `9be33daf4ea4c616a32014881fcbe226643e82a0e30ce0b332eb4554bba38737` | **EXACT MATCH** | — |
| `src/lib/data/accountRepository.ts` | `c8d7f0ac...ba28` | `c8d7f0acc7f4ecb759bcfaecd33afe708fffc8ae413404778ff248feb87aba28` | **EXACT MATCH** | — |
| `src/components/accounts/AddAccountForm.tsx` | `2183b14c...e20a` | `2183b14c8774b1a01b0aaf076d7c423b248ffbb240496de21030dc0e6cf1e20a` | **EXACT MATCH** | — |
| `src/app/settings/page.tsx` | `ad11456c...87ca` | `ad11456c43434a4c7ff75b132d4859fd1edfe1297a26d35733efaf01458287ca` | **EXACT MATCH** | — |
| `src/app/api/v1/accounts/route.ts` | `7412ff09...6cd4c` | `7412ff09f42791a27ffac7877679293b0e1cbf5815f19492c365f3d80a26cd4c` | **EXACT MATCH** | — |
| `src/app/api/v1/accounts/[id]/route.ts` | `474f2d31...f6e0` | `474f2d3176248af2f72318e4690e9dd073aec8753c40a49c9e4b178d4496f6e0` | **EXACT MATCH** | — |
| `src/app/api/v1/accounts/[id]/gate/route.ts` | `e003bea0...7e9` | `e003bea0586962ae9986bfa74221667d42e5616012c7d917defd6ba26c9aa7e9` | **EXACT MATCH** | — |
| `src/app/api/v1/accounts/[id]/phase/route.ts` | `17a34f8d...82db` | `17a34f8d08c6251f7f8264aa4aff503c56013434b58800fc8412cacdcd7982db` | **EXACT MATCH** | — |
| `src/app/api/v1/accounts/[id]/rulesets/route.ts` | `c0fd20ac...f73d` | `c0fd20ac5c99154b1561e0c4e8757a2b776bf6058a82bd0a875a84c96566f73d` | **EXACT MATCH** | — |
| `src/app/api/v1/config/supabase/route.ts` | `1e192bf3...5668` | `1e192bf3150b323640e2051f4e50f03e63e5463143c8c2ed89e1ae9db6455668` | **EXACT MATCH** | — |
| `src/app/api/v1/executions/route.ts` | `b2a38ae7...0219` | `b2a38ae78aad62ad0c5ea06e63cbe8ce5d8125469387e3772c5368d051270219` | **EXACT MATCH** | — |
| `src/app/api/v1/health/route.ts` | `d010465a...db15` | `d010465a2dd9b0a0c04276e0e2a69e48e9999468dc9fcc9d44b260fd563cdb15` | **EXACT MATCH** | — |
| `src/app/api/v1/sync/route.ts` | `d36ec5cc...7d43a` | `d36ec5cc0822ccabef3d27261c66ddc53a817512035c7742ea4008a9fc17d43a` | **EXACT MATCH** | — |
| `src/app/api/v1/trades/route.ts` | `33cd0390...9036d` | `33cd03908faeee8dc5c0005110f88f07940c036b792135e7db0f5d1cf039036d` | **EXACT MATCH** | — |
| `src/app/api/v1/trades/[id]/route.ts` | `389b6b40...03a1` | `389b6b4031675b2e9909bf48cb5896aa295673541406e00aece2ce26b7ea03a1` | **EXACT MATCH** | — |
| `src/context/TradingContext.tsx` | `78a8cf7c...9f77` | `04d0688ea09056d5bff70bcef884252af963b65d41a688aaedb3bf972fb41ee4` | **Injection Point** | L56 (`emitSyncBridgeEvent` import); L926, L937, L948 (account outbox events); L1052, L1065–1077, L1085, L1091 (trade create/delete + closed-trade append-only `trade_correction` guard); L1289, L1299, L1306 (journal outbox events); L1326 (risk rule outbox event). Zero signatures/return shapes changed. |
| `src/app/layout.tsx` | `72a870db...f958` | `c1d7c65f89bd52d21c36a9743d72f4d2be9cf29e4feb309ac41ea7dab3ff657f` | **Injection Point** | L3–10, L24–35: Wrapped app root in `<SessionSyncProvider>` + mounted `<SignInModal />`, `<LockScreenOverlay />`, `<SignOutConfirmModal />`, `<ConflictInboxModal />`. |
| `src/components/layout/Sidebar.tsx` | `c38eaa99...da4c` | `18276355ae342aa0923b63da10df30ea917630c945f10b54777660e97f64bf29` | **Injection Point** | L25 (`SyncStatusChip` import); L148–150 (replaced static `"TERMINAL SYNCED v1.0.4"` footer with live `<SyncStatusChip collapsed={collapsed} />`). |
| `src/components/layout/Header.tsx` | `03ed711b...d09a` | `52b65a8953839bf1c67e9787e66f3834dffbd5d6d4cdf1f2757f90d415994100` | **Injection Point** | L7, L9–10, L56 (`useSessionSync`, `SyncStatusChip`, `Lock`, `LogOut`); L106, L139, L203, L287, L320–346 (compact live `<SyncStatusChip compact />` + Lock & Sign-out buttons). |

