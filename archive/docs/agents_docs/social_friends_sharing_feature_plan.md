# Social Rides + Friends Feature Plan (Agent Handoff)

Last updated: 2026-03-08
Owner scope: Major Project workspace

## Feature Summary
Add a social layer so riders can:
- connect with friends and view eligible rides,
- share existing rides as public or link-based,
- replace bottom-nav Settings with Friends while keeping settings inside Profile.

## Current Baseline (Verified in Code)
- Bottom nav currently has `Dashboard`, `Rides`, `Profile`, `Settings`.
- File: `pulsecraft-bike/mobile_app/pulsecraft_app/lib/ui/app_shell.dart`
- Profile already has an `App Settings` entry.
- File: `pulsecraft-bike/mobile_app/pulsecraft_app/lib/features/profile/profile_screen.dart`
- Ride APIs are owner-only today.
- Files: `backend/app/routers/rides.py`, `backend/app/models.py`, `backend/app/schemas.py`
- No friend/follow/share visibility model exists yet in backend or mobile API layer.
- Files: `backend/app/models.py`, `pulsecraft-bike/mobile_app/pulsecraft_app/lib/services/api_service.dart`

## Problem and User Value
- No social motivation loop today (riders cannot follow friends or compare rides).
- No native shareability for existing rides reduces retention and growth.
- Navigation has duplication (`Settings` tab + Settings in Profile).

User outcomes:
- Friends tab for social engagement and repeat app use.
- Public/link sharing for organic growth and coaching collaboration.
- Cleaner IA with high-frequency tab usage.

## Scope
In scope:
- Friends connection flow (request, accept/decline, remove).
- Ride visibility modes: `private`, `friends`, `public`, `link_only`.
- Share-link creation/revocation for existing rides.
- Friends activity feed and ride viewing permissions.
- Bottom nav update: remove `Settings`, add `Friends`.

Out of scope (MVP):
- Likes/comments/DMs.
- Global ranking/discovery algorithm.
- Advanced moderation tooling.

## Functional Specification
### Navigation
- New tabs: `Dashboard`, `Rides`, `Friends`, `Profile`.
- Keep all app settings inside Profile (existing behavior).

### Friends
- Add friend request model and endpoints.
- Friend discovery for MVP uses phone contacts (with explicit permission and consent UX).
- Views:
- incoming requests,
- outgoing requests,
- accepted friends.

### Ride Sharing
- Add per-ride visibility control.
- Add link sharing with revoke.
- Share links default to no expiry (`never`) unless user explicitly sets an optional expiry.
- Existing rides default to `private` via migration/backfill.

### Access Rules
- Owner always has full access.
- `friends` rides visible only to accepted friends.
- `public` rides visible to all users (or discoverability-limited by product choice).
- `link_only` rides visible only via valid tokenized link.

## Edge Cases and Failure Modes
- Friend removal should immediately remove access to friends-only rides.
- Visibility downgrade to private should invalidate prior public exposure.
- Revoked/expired links must hard-fail with user-friendly message.
- Unsynced local rides cannot be shared until cloud upload succeeds.
- Prevent token brute-force with strong entropy + rate limiting.

## Technical Feasibility and Dependencies
Backend:
- Extend `Ride` model with visibility fields.
- Add `friend_requests`, `friendships`, and `ride_share_links` tables.
- Add endpoints for social graph and shared-ride retrieval paths.

Mobile:
- Add Friends tab/screen.
- Add ride-level share controls in ride list/detail.
- `share_plus` already present for OS share sheet integration.

## Tradeoffs and Reasoning
- Mutual friends chosen over one-way follow for privacy-first MVP.
- Separate link-token table preferred for revoke/expiry/audit flexibility.
- Default link expiry is `never` to minimize share friction and broken links; revoke remains the primary control.
- Friend discovery via contacts selected for strongest onboarding conversion in early social rollout.
- Keep owner-only endpoints stable; add new shared-read endpoints to minimize regression risk.

## Delivery Plan (MVP -> Iterations)
1. Data model + API contracts + migration defaults (`private`).
2. Friends workflow + Friends tab.
3. Ride visibility toggles + friends/public viewing.
4. Link sharing + revoke/expiry.
5. Hardening: permission tests, rate limits, telemetry payload pagination.

## Acceptance Criteria
- Bottom nav contains Friends and no Settings tab.
- Settings still accessible from Profile.
- Friend request lifecycle works end-to-end.
- Existing rides remain private after migration.
- Friends/public/link access controls enforced for list + detail endpoints.
- Share links can be created and revoked.
- No regression in ride upload/sync/restore.

## Metrics and Instrumentation
- `friend_request_sent`, `friend_request_accepted`
- `ride_visibility_changed`
- `share_link_created`, `share_link_opened`, `share_link_revoked`
- Friends feed DAU usage
- Auth/access-denied error rates on shared endpoints

## Risks and Mitigations
- Privacy leakage -> default private + clear UX labels.
- Link abuse -> high-entropy tokens + rate limits + optional expiry.
- Contact privacy risk -> explicit contact permission prompt, transparent matching notice, and opt-out flow.
- Performance cost for telemetry-heavy shared views -> summary-first + lazy detail load.
- Repo duplication risk (root `backend/` vs `pulsecraft-bike/backend/`) -> lock one source-of-truth before implementation.

## Open Questions
- Public discoverability: global feed vs profile-only?
- Public map privacy masking needed?