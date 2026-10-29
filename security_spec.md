# ReviewEase AI — Firestore Security Specification

## 1. Data Invariants & Relationship Mapping

- **Master Source of Truth**: `/businesses/{businessSlug}` is the root authority for each merchant workspace.
- **Zero PII Storage**: Neither `/businesses/{businessSlug}` nor `/businesses/{businessSlug}/sessions/{sessionId}` stores email addresses, phone numbers, or customer names.
- **Business Ownership & Creation**:
  - Only authenticated users with `email_verified == true` may create, update, list, or delete a `Business` document.
  - On `create`, `ownerId` MUST equal `request.auth.uid`, `slug` MUST equal `{businessSlug}`, and both `createdAt` and `updatedAt` MUST equal `request.time`.
  - Reserved slug `demo` cannot be claimed in `/businesses/demo` so the public interactive sandbox remains collision-free.
  - On `update`, `ownerId`, `slug`, and `createdAt` are strictly immutable, `updatedAt == request.time`, and updates are restricted to explicit action allowlists (`affectedKeys().hasOnly(...)`).
- **Public QR Scan Resolution (`get` vs `list`)**:
  - Customers scanning a QR code read `/businesses/{businessSlug}` via single-document `get`, permitted ONLY when `resource.data.isActive == true` (or when read by the verified owner).
  - Public `list` on `/businesses` is strictly forbidden to prevent merchant directory scraping; `allow list` requires a verified user AND `resource.data.ownerId == request.auth.uid`.
- **Anonymous Session Telemetry (`/businesses/{businessSlug}/sessions/{sessionId}`)**:
  - Customers scanning a QR code do not log in; they may ONLY `create` append-only `ReviewSessionEvent` documents when the parent `/businesses/{businessSlug}` exists AND has `isActive == true`, AND `incoming().businessOwnerId` strictly matches `get(.../businesses/$(businessSlug)).data.ownerId`.
  - `ReviewSessionEvent` documents are strictly immutable (`allow update: if false;`).
  - Reading (`get` and `list`) session telemetry is strictly restricted to the verified business owner (`resource.data.businessOwnerId == request.auth.uid`), with zero `get()` calls inside `allow list`.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Identity Spoofing on Business Create**: Authenticated user `uid_attacker` creates `/businesses/urban-cafe` with `ownerId: "uid_victim"` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts to create `/businesses/my-cafe` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Create**: Valid merchant payload plus extra key `"isVerifiedMerchant": true` -> `PERMISSION_DENIED` (`hasOnly` rejection).
4. **Slug Mismatch Poisoning**: Creating `/businesses/cafe-alpha` with payload `slug: "cafe-beta"` -> `PERMISSION_DENIED`.
5. **Owner Takeover via Update**: Owner or attacker updates `ownerId` or `createdAt` on `/businesses/cafe-alpha` -> `PERMISSION_DENIED`.
6. **Value Poisoning on Update**: Owner updates `googleReviewUrl` to `"javascript:alert(1)"` or a 10KB string -> `PERMISSION_DENIED` (regex & `maxLength <= 500` check in `isValidBusinessShape`).
7. **Unauthorized Directory Scraping (`list`)**: Authenticated user executes unfiltered `getDocs(collection(db, 'businesses'))` -> `PERMISSION_DENIED` (`resource.data.ownerId == request.auth.uid` enforced).
8. **Inactive Business Public Read**: Unauthenticated visitor calls `getDoc` on `/businesses/paused-cafe` where `isActive == false` -> `PERMISSION_DENIED`.
9. **Orphaned Session Telemetry Write**: Unauthenticated visitor creates `/businesses/nonexistent-cafe/sessions/s1` -> `PERMISSION_DENIED` (parent `exists` & `isActive` check fails).
10. **Spoofed Session `businessOwnerId`**: Visitor creates `/businesses/cafe-alpha/sessions/s1` with `businessOwnerId: "uid_attacker"` so attacker can list victim's analytics -> `PERMISSION_DENIED` (`get()` parent `ownerId` match fails).
11. **Session Mutation / Tampering**: Any user attempts `updateDoc` on `/businesses/cafe-alpha/sessions/s1` -> `PERMISSION_DENIED` (`allow update: if false`).
12. **Client Timestamp Forgery**: Creating a business or session with a backdated `createdAt` timestamp instead of `serverTimestamp()` (`request.time`) -> `PERMISSION_DENIED`.
