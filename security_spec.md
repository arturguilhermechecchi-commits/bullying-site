# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Global Default Deny**: Any path not explicitly matched is unconditionally denied (`allow read, write: if false;`).
2. **Path Variable Hardening (`isValidId`)**: All single-document operations (`get`, `create`, `update`, `delete`) must validate that the document ID matches `^[a-zA-Z0-9_\-]+$` and `size() <= 128`, and that the document's `id` field matches the path variable.
3. **Question Integrity (`/questions/{questionId}`)**:
   - Every question must contain strictly the allowed keys `['id', 'question', 'optA', 'optB', 'optC', 'orderIndex', 'isPublished', 'adminPasscode', 'createdAt', 'updatedAt']`.
   - String lengths are strictly bounded (`question` 1..1000, `optA`/`optB`/`optC` 1..500).
   - Writes (`create`, `update`, `delete`) require either a verified Admin (`isAdmin()`) or a valid `adminPasscode == '010203'`.
   - `createdAt` is immutable on update and must equal `request.time` on create; `updatedAt` must equal `request.time`.
   - List queries (`allow list`) must filter by `resource.data.isPublished == true`.
4. **Global Settings Integrity (`/settings/{settingId}`)**:
   - Only `settingId == 'global'` is permitted.
   - Strict keys `['id', 'optA', 'optB', 'optC', 'customVpnHost', 'isPublished', 'adminPasscode', 'updatedAt']`.
   - Writes require `isAdmin()` or `adminPasscode == '010203'` and `updatedAt == request.time`.
5. **Anonymous Submission & Relational Response Atomicity (`/submissions/{submissionId}`, `/responses/{responseId}`)**:
   - `submissions` and `responses` are strictly immutable once created (`allow update: if false;`) and must have `isAnonymous == true` and `createdAt == request.time`.
   - Every `QuestionResponse` (`/responses/{responseId}`) must reference an existing `/questions/$(incoming().questionId)` and an existing or batch-created `/submissions/$(incoming().submissionId)` via `exists()` or `existsAfter()`.
   - `selectedOption` must be an integer in `[0, 1, 2]` (corresponding only to options A, B, or C).
6. **VPN Gateways Integrity (`/vpnGateways/{gatewayId}`)**:
   - Strict keys `['id', 'label', 'hostUrl', 'provider', 'isPublished', 'adminPasscode', 'createdAt', 'updatedAt']`.
   - Writes require `isAdmin()` or `adminPasscode == '010203'`.
7. **Admin Isolation (`/admins/{adminId}`)**:
   - PII (`email`) in `/admins/{adminId}` is readable only by the owner (`request.auth.uid == adminId`) or a verified bootstrapped admin (`arturguilhermechecchi@gmail.com` with `email_verified == true`).

---

## 2. The "Dirty Dozen" Payloads

1. **Ghost Field Injection on Question (`Shadow Update`)**:
   `{ "id": "q-1", "question": "Teste?", "optA": "A", "optB": "B", "optC": "C", "orderIndex": 0, "isPublished": true, "adminPasscode": "010203", " isVerified": true }` -> Rejected by `keys().hasOnly(...)`.
2. **Unauthorized Question Creation (Wrong Admin Passcode)**:
   `{ "id": "q-1", "question": "Hack?", "optA": "A", "optB": "B", "optC": "C", "orderIndex": 0, "isPublished": true, "adminPasscode": "999999" }` -> Rejected by `adminPasscode == '010203' || isAdmin()`.
3. **Option D / Out-of-Range Option Index in Response**:
   `{ "id": "r-1", "submissionId": "sub-1", "questionId": "q-1", "selectedOption": 3, "isAnonymous": true }` -> Rejected by `selectedOption in [0, 1, 2]`.
4. **Orphaned QuestionResponse (Non-Existent Question ID)**:
   `{ "id": "r-1", "submissionId": "sub-1", "questionId": "q-nonexistent", "selectedOption": 0, "isAnonymous": true }` -> Rejected by `exists(/databases/$(database)/documents/questions/$(incoming().questionId))`.
5. **Orphaned QuestionResponse (Missing Parent Submission)**:
   `{ "id": "r-1", "submissionId": "sub-missing", "questionId": "q-1", "selectedOption": 1, "isAnonymous": true }` -> Rejected by `exists(...) || existsAfter(...)` on `/submissions/`.
6. **Denial-of-Wallet Oversized Question String (2000 chars)**:
   `{ "id": "q-1", "question": "<2000_chars>", ... }` -> Rejected by `data.question.size() <= 1000`.
7. **ID Poisoning Attack (Invalid Characters in Document ID)**:
   Path `/questions/bad$id!@#` -> Rejected by `isValidId(questionId)`.
8. **Timestamp Spoofing (Client-forged Past Timestamp)**:
   `createdAt: Timestamp(2020, 1, 1)` -> Rejected by `incoming().createdAt == request.time`.
9. **Immutable `createdAt` Tampering on Question Update**:
   Updating `createdAt` on an existing `/questions/{questionId}` document -> Rejected by `incoming().createdAt == existing().createdAt` and `affectedKeys().hasOnly(...)`.
10. **Tampering with Completed Submission (`Update` on `/submissions/{submissionId}`)**:
    Attempting to modify `countA` after submission -> Rejected by `allow update: if false;`.
11. **Unverified Admin Email Spoofing**:
    Authenticated token with `email == 'arturguilhermechecchi@gmail.com'` but `email_verified == false` -> Rejected by `request.auth.token.email_verified == true`.
12. **PII Scraping on `/admins/{adminId}`**:
    Non-admin user attempting `get` or `list` on `/admins/otherUid` -> Rejected by `isOwner(adminId) || isAdmin()`.

---

## 3. Red Team Audit & Conflict Report

- **Collection `/questions/{questionId}`**:
  - *Identity Spoofing*: Protected via `isAdmin()` or explicit `adminPasscode == '010203'`.
  - *State Shortcutting*: `createdAt` is locked (`incoming().createdAt == existing().createdAt`).
  - *Resource Poisoning*: Guarded by `isValidId(questionId)` and strict `.size()` limits on `question`, `optA`, `optB`, `optC`.
  - *Value Poisoning*: `isValidQuestion(incoming())` wraps the entire `allow update` block alongside `affectedKeys().hasOnly(...)`.
- **Collection `/settings/{settingId}`**:
  - Locked to `settingId == 'global'`, validated by `isValidSettings(incoming())` on both `create` and `update`.
- **Collections `/submissions/{submissionId}` & `/responses/{responseId}`**:
  - Immutable after creation (`allow update: if false;`).
  - Atomicity & relational consistency enforced via `exists()` and `existsAfter()`.
- **Collection `/vpnGateways/{gatewayId}`**:
  - Guarded by `isValidId(gatewayId)` and `isValidVpnGateway(incoming())` on both `create` and `update`.
- **Collection `/admins/{adminId}`**:
  - Strictly isolated to owner or verified bootstrapped admin (`email_verified == true`).
