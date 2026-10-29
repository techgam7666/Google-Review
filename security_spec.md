# ReviewEase AI — Firestore Security Specification (Monthly SaaS Edition)

## 1. Data Invariants & Relationship Mapping

- **Master Sources of Truth**:
  - `/subscriptions/{userId}` governs each merchant's monthly/annual SaaS plan (`trial`, `starter`, `growth`, `agency`), shop quota (`maxBusinesses`), and active status (`trialing`, `active`, `paused`, `canceled`).
  - `/businesses/{businessSlug}` governs each shop's public QR scanner page (`/review/{businessSlug}`) and Google Maps destination link. Creating a new shop requires an active or trialing `/subscriptions/{ownerId}` document (or verified platform admin privileges).
  - `/platformSettings/billing` stores founder payment collection configuration (UPI VPA, checkout links, trial length) writable exclusively by verified platform admins (`techgam766@gmail.com` with `email_verified == true` or `/admins/{uid}`).
  - `/admins/{adminUid}` stores delegated admin UIDs writable only by verified admins.
- **Zero PII Exposure**:
  - No customer or merchant emails/phone numbers are stored in `/businesses` or `/subscriptions`.
  - `/subscriptions/{userId}` `get` and `list` are strictly restricted to `userId == request.auth.uid` or `isAdmin()`.
- **Terminal State & Quota Integrity**:
  - `Subscription.maxBusinesses` is cryptographically coupled to `planId` in `isValidSubscriptionShape` (`trial`/`starter` -> `1`, `growth` -> `5`, `agency` -> `25`) so clients cannot spoof higher shop quotas.
  - Once `Subscription.status == 'canceled'`, updates are locked unless overridden by `isAdmin()`.
- **Public QR Scan Resolution (`get` vs `list`)**:
  - Customers scanning a shop QR code read `/businesses/{businessSlug}` via single-document `get`, permitted ONLY when `resource.data.isActive == true` (or by the verified owner / admin).
  - `allow list` on `/businesses` and `/subscriptions` enforces `resource.data` ownership (`ownerId == request.auth.uid` / `userId == request.auth.uid`) or `isAdmin()`, with zero `get()` calls inside `allow list`.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Identity Spoofing on Business Create**: Authenticated user `uid_attacker` creates `/businesses/urban-cafe` with `ownerId: "uid_victim"` -> `PERMISSION_DENIED`.
2. **Unsubscribed Business Creation**: Verified user without `/subscriptions/{uid}` attempts to create `/businesses/free-rider-shop` -> `PERMISSION_DENIED`.
3. **Subscription Quota Escalation**: User creates `/subscriptions/uid_user` with `planId: "trial"` and `maxBusinesses: 25` -> `PERMISSION_DENIED`.
4. **Admin Email Spoofing (`email_verified == false`)**: Attacker with unverified `techgam766@gmail.com` attempts to update `/platformSettings/billing` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection on Create**: Valid business or subscription payload plus extra key `"isVerifiedMerchant": true` -> `PERMISSION_DENIED` (`hasOnly` rejection).
6. **Terminal Subscription Bypass**: User attempts to self-reactivate a `canceled` `/subscriptions/{uid}` document -> `PERMISSION_DENIED` (requires `isAdmin()`).
7. **Unauthorized Billing Settings Tampering**: Non-admin merchant attempts to write their own `upiId` to `/platformSettings/billing` -> `PERMISSION_DENIED`.
8. **Unauthorized Subscription Scraping (`list`)**: Merchant `uid_a` queries `/subscriptions` without `where('userId', '==', 'uid_a')` -> `PERMISSION_DENIED`.
9. **Value Poisoning on Update**: Owner updates `googleReviewUrl` to `"javascript:alert(1)"` -> `PERMISSION_DENIED`.
10. **Orphaned Session Telemetry Write**: Unauthenticated visitor creates `/businesses/nonexistent-cafe/sessions/s1` -> `PERMISSION_DENIED`.
11. **Spoofed Session `businessOwnerId`**: Visitor creates `/businesses/cafe-alpha/sessions/s1` with `businessOwnerId: "uid_attacker"` -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: Creating a business, subscription, or session with a forged `createdAt` timestamp instead of `request.time` -> `PERMISSION_DENIED`.
