/**
 * Firestore Security Rules Test Suite (Dirty Dozen Verification)
 * Verifies that all 12 adversarial payloads in security_spec.md return PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'create' | 'update' | 'get' | 'list';
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Shadow Update / Ghost Field Injection on Question',
    collection: 'questions',
    docId: 'q-1',
    operation: 'create',
    payload: {
      id: 'q-1',
      question: 'Pergunta de teste?',
      optA: 'A',
      optB: 'B',
      optC: 'C',
      orderIndex: 0,
      isPublished: true,
      adminPasscode: '010203',
      isVerifiedGhostField: true
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'Unauthorized Question Creation with Invalid Admin Passcode',
    collection: 'questions',
    docId: 'q-2',
    operation: 'create',
    payload: {
      id: 'q-2',
      question: 'Pergunta inválida?',
      optA: 'A',
      optB: 'B',
      optC: 'C',
      orderIndex: 0,
      isPublished: true,
      adminPasscode: '999999'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 3,
    name: 'Option D / Out-of-Range Option Index (3) in QuestionResponse',
    collection: 'responses',
    docId: 'r-1',
    operation: 'create',
    payload: {
      id: 'r-1',
      submissionId: 'sub-1',
      questionId: 'q-1',
      selectedOption: 3,
      isAnonymous: true
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 4,
    name: 'Orphaned QuestionResponse referencing non-existent Question',
    collection: 'responses',
    docId: 'r-2',
    operation: 'create',
    payload: {
      id: 'r-2',
      submissionId: 'sub-1',
      questionId: 'q-does-not-exist',
      selectedOption: 0,
      isAnonymous: true
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 5,
    name: 'Orphaned QuestionResponse without parent Submission',
    collection: 'responses',
    docId: 'r-3',
    operation: 'create',
    payload: {
      id: 'r-3',
      submissionId: 'sub-missing',
      questionId: 'q-1',
      selectedOption: 1,
      isAnonymous: true
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'Denial-of-Wallet Oversized Question String (>1000 chars)',
    collection: 'questions',
    docId: 'q-3',
    operation: 'create',
    payload: {
      id: 'q-3',
      question: 'X'.repeat(1500),
      optA: 'A',
      optB: 'B',
      optC: 'C',
      orderIndex: 0,
      isPublished: true,
      adminPasscode: '010203'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'ID Poisoning Attack with special characters',
    collection: 'questions',
    docId: 'invalid$id!@#',
    operation: 'create',
    payload: {
      id: 'invalid$id!@#',
      question: 'Teste?',
      optA: 'A',
      optB: 'B',
      optC: 'C',
      orderIndex: 0,
      isPublished: true,
      adminPasscode: '010203'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 8,
    name: 'Timestamp Spoofing with forged client timestamp',
    collection: 'submissions',
    docId: 'sub-spoof',
    operation: 'create',
    payload: {
      id: 'sub-spoof',
      totalQuestions: 1,
      countA: 1,
      countB: 0,
      countC: 0,
      isAnonymous: true,
      createdAt: '2000-01-01T00:00:00Z'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'Immutable createdAt Tampering on Question Update',
    collection: 'questions',
    docId: 'q-1',
    operation: 'update',
    payload: {
      createdAt: '2099-01-01T00:00:00Z'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 10,
    name: 'Mutating an already submitted anonymous Submission',
    collection: 'submissions',
    docId: 'sub-1',
    operation: 'update',
    payload: {
      countA: 999
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Unverified Admin Email Spoofing',
    collection: 'admins',
    docId: 'spoof-admin',
    operation: 'get',
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 12,
    name: 'PII Scraping on /admins collection by non-owner',
    collection: 'admins',
    docId: 'other-user-uid',
    operation: 'get',
    expectedResult: 'PERMISSION_DENIED'
  }
];
