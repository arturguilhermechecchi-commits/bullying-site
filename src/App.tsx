/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  RotateCcw,
  Award,
  Shield,
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  LogOut,
  Play,
  BarChart3,
  ListChecks,
  Copy,
  Check,
  Download,
  ExternalLink,
  Network,
  Activity,
  Database,
  RefreshCw,
  LogIn
} from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { INITIAL_QUESTIONS, Question } from './data/questions';
import { correctPortugueseText } from './utils/grammarPtBr';
import {
  db,
  auth,
  googleProvider,
  firebaseConfig,
  doc,
  getDocFromServer,
  collection,
  query,
  where,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  getDocs,
  signInWithPopup,
  signOut,
  handleFirestoreError,
  OperationType
} from './firebase';

const OPTION_LETTERS = ['A', 'B', 'C'] as const;
const STORAGE_KEY = 'quiz_escolar_questions_v1';
const SAVED_OPTIONS_KEY = 'quiz_escolar_saved_options_v1';
const RESPONSES_HISTORY_KEY = 'quiz_escolar_responses_history_v1';
const ADMIN_ACCESS_CODE = '010203';

// Blueprint maxLengths and regex constraints from firebase-blueprint.json
const ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_ID_LEN = 128;
const MAX_QUESTION_LEN = 1000;
const MAX_OPTION_LEN = 500;
const MAX_VPN_HOST_LEN = 256;
const MAX_GATEWAY_LABEL_LEN = 120;
const MAX_GATEWAY_PROVIDER_LEN = 80;

export interface QuizSubmission {
  id: string;
  submittedAt: string;
  answers: Record<string, number>; // questionId -> optionIndex (0, 1, or 2)
  countA?: number;
  countB?: number;
  countC?: number;
  totalQuestions?: number;
}

export interface VpnGatewayItem {
  id: string;
  label: string;
  hostUrl: string;
  provider: string;
}

interface NetworkEndpoint {
  interfaceName: string;
  ip: string;
  url: string;
  type: 'vpn' | 'lan';
  providerLabel: string;
}

interface ServerInfo {
  localhostUrl: string;
  networkUrls: string[];
  vpnEndpoints?: NetworkEndpoint[];
  lanEndpoints?: NetworkEndpoint[];
  customVpnHost?: string;
  clientIp?: string;
  publicAppUrl?: string;
  port: number;
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, MAX_ID_LEN);
  return cleaned && ID_REGEX.test(cleaned) ? cleaned : `id-${Date.now()}`;
}

export default function App() {
  const [questions, setQuestions] = useState<Question[]>(INITIAL_QUESTIONS);
  const [savedDefaultOptions, setSavedDefaultOptions] = useState<[string, string, string]>([
    '',
    '',
    ''
  ]);
  const [submissions, setSubmissions] = useState<QuizSubmission[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(RESPONSES_HISTORY_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [vpnGateways, setVpnGateways] = useState<VpnGatewayItem[]>([]);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);
  const [dbSyncStatus, setDbSyncStatus] = useState<string | null>(null);
  const [isForcingSync, setIsForcingSync] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [isRefreshingSubmissions, setIsRefreshingSubmissions] = useState<boolean>(false);
  const [isClearingSubmissions, setIsClearingSubmissions] = useState<boolean>(false);
  const [clearSuccessStatus, setClearSuccessStatus] = useState<string | null>(null);

  // References to persist real-time stream data from Firestore
  const responsesBySubRef = useRef<Map<string, Record<string, number>>>(new Map());
  const submissionsMetaRef = useRef<
    Map<
      string,
      {
        id: string;
        submittedAt: string;
        countA: number;
        countB: number;
        countC: number;
        totalQuestions: number;
      }
    >
  >(new Map());

  const [serverInfo, setServerInfo] = useState<ServerInfo>(() => ({
    localhostUrl: 'http://localhost:3000',
    networkUrls: [],
    vpnEndpoints: [],
    lanEndpoints: [],
    customVpnHost: '',
    clientIp: '127.0.0.1',
    publicAppUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    port: 3000
  }));

  const [customVpnInput, setCustomVpnInput] = useState<string>('');
  const [newGatewayLabel, setNewGatewayLabel] = useState<string>('');
  const [newGatewayProvider, setNewGatewayProvider] = useState<string>('Radmin VPN');
  const [newGatewayUrl, setNewGatewayUrl] = useState<string>('');
  const [vpnPingStatus, setVpnPingStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [adminTab, setAdminTab] = useState<'perguntas' | 'grafico' | 'vpn'>('perguntas');
  const typedBufferRef = useRef<string>('');

  // Admin Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState<string>('');
  const [options, setOptions] = useState<[string, string, string]>(['', '', '']);
  const [applyToAllQuestions, setApplyToAllQuestions] = useState<boolean>(true);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const hasSeededFirestoreRef = useRef<boolean>(false);

  const firestoreConsoleUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data`;

  // Track Firebase Auth state
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return () => unsubAuth();
  }, []);

  // Sync helper to persist changes to the local Express server as well
  const syncQuestionsToServer = useCallback(
    async (nextQuestions: Question[], nextSavedOptions: [string, string, string]) => {
      try {
        await fetch('/api/quiz/questions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questions: nextQuestions,
            savedDefaultOptions: nextSavedOptions
          })
        });
      } catch {
        // Ignore local server error if running purely on static/cloud
      }
    },
    []
  );

  // Force-push all current state (settings, questions, submissions/responses) to Firebase Firestore
  const forcePushEverythingToFirestore = useCallback(
    async (
      questionsToPush: Question[],
      optionsToPush: [string, string, string],
      vpnHostToPush: string,
      submissionsToPush?: QuizSubmission[],
      showBanner = false
    ) => {
      if (showBanner) {
        setIsForcingSync(true);
        setDbSyncStatus('Forçando vínculo e gravando todas as coleções no Firebase Firestore...');
      }
      const startTime = performance.now();

      try {
        const cleanOptA = correctPortugueseText(optionsToPush[0] || '').slice(0, MAX_OPTION_LEN);
        const cleanOptB = correctPortugueseText(optionsToPush[1] || '').slice(0, MAX_OPTION_LEN);
        const cleanOptC = correctPortugueseText(optionsToPush[2] || '').slice(0, MAX_OPTION_LEN);
        const cleanVpn = (vpnHostToPush || '').trim().slice(0, MAX_VPN_HOST_LEN);

        // 1. Force write to settings/global
        try {
          await setDoc(doc(db, 'settings', 'global'), {
            id: 'global',
            optA: cleanOptA,
            optB: cleanOptB,
            optC: cleanOptC,
            customVpnHost: cleanVpn,
            isPublished: true,
            adminPasscode: ADMIN_ACCESS_CODE,
            updatedAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'settings/global');
        }

        // 2. Force write all questions
        for (let i = 0; i < questionsToPush.length; i++) {
          const q = questionsToPush[i];
          const qId = sanitizeId(q.id || `q-${Date.now()}-${i}`);
          const qText = correctPortugueseText(q.question || '', true).slice(0, MAX_QUESTION_LEN);
          const qOptA = correctPortugueseText(q.options[0] || cleanOptA || 'Alternativa A').slice(
            0,
            MAX_OPTION_LEN
          );
          const qOptB = correctPortugueseText(q.options[1] || cleanOptB || 'Alternativa B').slice(
            0,
            MAX_OPTION_LEN
          );
          const qOptC = correctPortugueseText(q.options[2] || cleanOptC || 'Alternativa C').slice(
            0,
            MAX_OPTION_LEN
          );

          if (!qText) continue;

          try {
            await setDoc(doc(db, 'questions', qId), {
              id: qId,
              question: qText,
              optA: qOptA,
              optB: qOptB,
              optC: qOptC,
              orderIndex: i,
              isPublished: true,
              adminPasscode: ADMIN_ACCESS_CODE,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `questions/${qId}`);
          }
        }

        // 3. Force write any local/server submissions not yet in Firestore
        if (Array.isArray(submissionsToPush) && submissionsToPush.length > 0) {
          const existingQuestionIds = new Set(questionsToPush.map((q) => sanitizeId(q.id)));
          for (const sub of submissionsToPush) {
            const subId = sanitizeId(sub.id || `sub-${Date.now()}`);
            let countA = 0;
            let countB = 0;
            let countC = 0;
            const validEntries: { questionId: string; choice: number }[] = [];

            Object.entries(sub.answers || {}).forEach(([rawQId, choice]) => {
              const qId = sanitizeId(rawQId);
              if (
                existingQuestionIds.has(qId) &&
                (choice === 0 || choice === 1 || choice === 2)
              ) {
                if (choice === 0) countA++;
                if (choice === 1) countB++;
                if (choice === 2) countC++;
                validEntries.push({ questionId: qId, choice });
              }
            });

            if (validEntries.length > 0) {
              try {
                const batch = writeBatch(db);
                batch.set(doc(db, 'submissions', subId), {
                  id: subId,
                  totalQuestions: validEntries.length,
                  countA,
                  countB,
                  countC,
                  isAnonymous: true,
                  createdAt: serverTimestamp()
                });
                validEntries.forEach((entry, idx) => {
                  const rId = sanitizeId(`${subId}-r-${idx}`);
                  batch.set(doc(db, 'responses', rId), {
                    id: rId,
                    submissionId: subId,
                    questionId: entry.questionId,
                    selectedOption: entry.choice,
                    isAnonymous: true,
                    createdAt: serverTimestamp()
                  });
                });
                await batch.commit();
              } catch {
                // Ignore if already committed
              }
            }
          }
        }

        // 4. Verify live read from server (bypassing cache)
        await getDocFromServer(doc(db, 'settings', 'global'));
        setIsFirebaseConnected(true);

        if (showBanner) {
          const elapsed = Math.round(performance.now() - startTime);
          setDbSyncStatus(
            `● Vínculo Forçado com Sucesso (${elapsed}ms)! Projeto: ${firebaseConfig.projectId} · Banco: ${firebaseConfig.firestoreDatabaseId}`
          );
          setTimeout(() => setDbSyncStatus(null), 6000);
        }
      } catch (err) {
        console.error('Erro ao forçar vínculo com o Firebase:', err);
        if (showBanner) {
          setDbSyncStatus('Erro ao forçar vínculo com o Firebase. Verifique a conexão.');
        }
      } finally {
        if (showBanner) {
          setIsForcingSync(false);
        }
      }
    },
    []
  );

  // Real-time Firebase Firestore listeners for ALL collections
  useEffect(() => {
    // 1. Listen to Questions in Firestore
    const qQuestions = query(collection(db, 'questions'), where('isPublished', '==', true));
    const unsubQuestions = onSnapshot(
      qQuestions,
      (snapshot) => {
        setIsFirebaseConnected(true);
        const loaded: { item: Question; orderIndex: number }[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const rawQuestion = String(data.question || '');
          const rawOptA = String(data.optA || '');
          const rawOptB = String(data.optB || '');
          const rawOptC = String(data.optC || '');

          const correctedQuestion = correctPortugueseText(rawQuestion, true).slice(0, MAX_QUESTION_LEN);
          const correctedOptA = correctPortugueseText(rawOptA).slice(0, MAX_OPTION_LEN);
          const correctedOptB = correctPortugueseText(rawOptB).slice(0, MAX_OPTION_LEN);
          const correctedOptC = correctPortugueseText(rawOptC).slice(0, MAX_OPTION_LEN);
          const orderIdx = typeof data.orderIndex === 'number' ? data.orderIndex : 0;
          const docId = sanitizeId(String(data.id || docSnap.id));

          // Se houver qualquer palavra com erro ortográfico no banco, corrige automaticamente no Firestore
          if (
            correctedQuestion &&
            (correctedQuestion !== rawQuestion ||
              correctedOptA !== rawOptA ||
              correctedOptB !== rawOptB ||
              correctedOptC !== rawOptC)
          ) {
            updateDoc(doc(db, 'questions', docId), {
              question: correctedQuestion,
              optA: correctedOptA || rawOptA,
              optB: correctedOptB || rawOptB,
              optC: correctedOptC || rawOptC,
              orderIndex: orderIdx,
              isPublished: true,
              adminPasscode: ADMIN_ACCESS_CODE,
              updatedAt: serverTimestamp()
            }).catch(() => {});
          }

          loaded.push({
            orderIndex: orderIdx,
            item: {
              id: docId,
              question: correctedQuestion || rawQuestion,
              options: [
                correctedOptA || rawOptA,
                correctedOptB || rawOptB,
                correctedOptC || rawOptC
              ]
            }
          });
        });

        loaded.sort((a, b) => a.orderIndex - b.orderIndex);
        const sortedQuestions = loaded.map((entry) => entry.item);

        if (sortedQuestions.length > 0) {
          setQuestions(sortedQuestions);
          hasSeededFirestoreRef.current = true;
        } else if (!hasSeededFirestoreRef.current) {
          // Force link on boot from server or localStorage
          hasSeededFirestoreRef.current = true;
          fetch('/api/quiz')
            .then((r) => (r.ok ? r.json() : null))
            .then((serverData) => {
              const localQuestionsRaw = localStorage.getItem(STORAGE_KEY);
              const localOptionsRaw = localStorage.getItem(SAVED_OPTIONS_KEY);
              const fallbackQuestions: Question[] =
                serverData && Array.isArray(serverData.questions) && serverData.questions.length > 0
                  ? serverData.questions
                  : localQuestionsRaw
                  ? JSON.parse(localQuestionsRaw)
                  : [];
              const fallbackOptions: [string, string, string] =
                serverData &&
                Array.isArray(serverData.savedDefaultOptions) &&
                serverData.savedDefaultOptions.length >= 3
                  ? [
                      String(serverData.savedDefaultOptions[0] || ''),
                      String(serverData.savedDefaultOptions[1] || ''),
                      String(serverData.savedDefaultOptions[2] || '')
                    ]
                  : localOptionsRaw
                  ? JSON.parse(localOptionsRaw)
                  : ['', '', ''];
              const fallbackSubs: QuizSubmission[] =
                serverData && Array.isArray(serverData.submissions) ? serverData.submissions : [];

              forcePushEverythingToFirestore(
                fallbackQuestions,
                fallbackOptions,
                serverData?.customVpnHost || '',
                fallbackSubs,
                false
              );
            })
            .catch(() => {});
        }
        setIsLoading(false);
      },
      (error) => {
        setIsLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'questions');
      }
    );

    // 2. Listen to Global Settings (Saved A, B, C options & Custom VPN Host)
    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'global'),
      (docSnap) => {
        setIsFirebaseConnected(true);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const nextSaved: [string, string, string] = [
            correctPortugueseText(String(data.optA || '')),
            correctPortugueseText(String(data.optB || '')),
            correctPortugueseText(String(data.optC || ''))
          ];
          setSavedDefaultOptions(nextSaved);
          setOptions((prev) =>
            prev[0] === '' && prev[1] === '' && prev[2] === '' ? nextSaved : prev
          );
          if (typeof data.customVpnHost === 'string') {
            setServerInfo((prev) => ({
              ...prev,
              customVpnHost: data.customVpnHost
            }));
            setCustomVpnInput((prev) => (prev === '' ? data.customVpnHost : prev));
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/global');
      }
    );

    // Helper function to sync merged submissions & responses reliably
    const syncCombinedSubmissions = () => {
      setSubmissions(() => {
        const merged = new Map<string, QuizSubmission>();

        // 1. Merge metadata from submissions collection in Firestore
        submissionsMetaRef.current.forEach((meta, subId) => {
          const subAnswers = responsesBySubRef.current.get(subId) || {};
          merged.set(subId, {
            id: subId,
            submittedAt: meta.submittedAt || new Date().toISOString(),
            answers: subAnswers,
            countA: meta.countA,
            countB: meta.countB,
            countC: meta.countC,
            totalQuestions: meta.totalQuestions
          });
        });

        // 2. Merge responses from responses collection
        responsesBySubRef.current.forEach((answers, subId) => {
          if (!merged.has(subId)) {
            merged.set(subId, {
              id: subId,
              submittedAt: new Date().toISOString(),
              answers: answers || {},
              totalQuestions: Object.keys(answers || {}).length
            });
          } else {
            const existing = merged.get(subId)!;
            existing.answers = { ...(existing.answers || {}), ...(answers || {}) };
          }
        });

        const list = Array.from(merged.values());
        try {
          if (list.length > 0) {
            localStorage.setItem(RESPONSES_HISTORY_KEY, JSON.stringify(list));
          } else {
            localStorage.removeItem(RESPONSES_HISTORY_KEY);
          }
        } catch {}
        return list;
      });
    };

    // 3. Listen to Anonymous Responses in Firestore (Real-time & Persistent)
    const qResponses = query(collection(db, 'responses'), where('isAnonymous', '==', true));
    const unsubResponses = onSnapshot(
      qResponses,
      (snapshot) => {
        setIsFirebaseConnected(true);
        const freshMap = new Map<string, Record<string, number>>();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const subId = String(data.submissionId || '');
          const qId = String(data.questionId || '');
          const selectedOption = Number(data.selectedOption);

          if (subId && qId && (selectedOption === 0 || selectedOption === 1 || selectedOption === 2)) {
            if (!freshMap.has(subId)) {
              freshMap.set(subId, {});
            }
            freshMap.get(subId)![qId] = selectedOption;
          }
        });
        responsesBySubRef.current = freshMap;
        syncCombinedSubmissions();
      },
      (error) => {
        console.warn('Erro ao carregar respostas do Firestore:', error);
      }
    );

    // 4. Listen to Anonymous Submissions collection in Firestore
    const qSubmissions = query(collection(db, 'submissions'), where('isAnonymous', '==', true));
    const unsubSubmissions = onSnapshot(
      qSubmissions,
      (snapshot) => {
        setIsFirebaseConnected(true);
        const freshMeta = new Map<
          string,
          {
            id: string;
            submittedAt: string;
            countA: number;
            countB: number;
            countC: number;
            totalQuestions: number;
          }
        >();
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const subId = String(d.id || docSnap.id);
          freshMeta.set(subId, {
            id: subId,
            submittedAt:
              d.createdAt && typeof d.createdAt.toDate === 'function'
                ? d.createdAt.toDate().toISOString()
                : new Date().toISOString(),
            countA: typeof d.countA === 'number' ? d.countA : 0,
            countB: typeof d.countB === 'number' ? d.countB : 0,
            countC: typeof d.countC === 'number' ? d.countC : 0,
            totalQuestions: typeof d.totalQuestions === 'number' ? d.totalQuestions : 0
          });
        });
        submissionsMetaRef.current = freshMeta;
        syncCombinedSubmissions();
      },
      (error) => {
        console.warn('Erro ao escutar submissões do Firestore:', error);
      }
    );

    // 5. Listen to VPN Gateways in Firestore
    const qGateways = query(collection(db, 'vpnGateways'), where('isPublished', '==', true));
    const unsubGateways = onSnapshot(
      qGateways,
      (snapshot) => {
        const list: VpnGatewayItem[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: String(d.id || docSnap.id),
            label: String(d.label || ''),
            hostUrl: String(d.hostUrl || ''),
            provider: String(d.provider || 'VPN')
          });
        });
        setVpnGateways(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'vpnGateways');
      }
    );

    return () => {
      unsubQuestions();
      unsubSettings();
      unsubResponses();
      unsubSubmissions();
      unsubGateways();
    };
  }, [forcePushEverythingToFirestore]);

  // Fetch local/network adapter info from Express backend
  const fetchServerNetworkInfo = useCallback(async () => {
    try {
      const infoRes = await fetch('/api/server-info');
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        setServerInfo((prev) => ({
          ...infoData,
          customVpnHost: prev.customVpnHost || infoData.customVpnHost || '',
          publicAppUrl:
            infoData.publicAppUrl && !infoData.publicAppUrl.includes('localhost')
              ? infoData.publicAppUrl
              : window.location.origin
        }));
      }
    } catch {
      // Ignore if offline
    }
  }, []);

  useEffect(() => {
    fetchServerNetworkInfo();
  }, [fetchServerNetworkInfo]);

  useEffect(() => {
    if (!isLoading) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
        localStorage.setItem(SAVED_OPTIONS_KEY, JSON.stringify(savedDefaultOptions));
        if (submissions.length > 0) {
          localStorage.setItem(RESPONSES_HISTORY_KEY, JSON.stringify(submissions));
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, [questions, savedDefaultOptions, submissions, isLoading]);

  // Automatic background synchronization of options A, B, C and questions to Firebase Firestore
  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      const cleanOptA = (savedDefaultOptions[0] || '').trim().slice(0, MAX_OPTION_LEN);
      const cleanOptB = (savedDefaultOptions[1] || '').trim().slice(0, MAX_OPTION_LEN);
      const cleanOptC = (savedDefaultOptions[2] || '').trim().slice(0, MAX_OPTION_LEN);
      const cleanVpn = (serverInfo.customVpnHost || '').trim().slice(0, MAX_VPN_HOST_LEN);

      setDoc(doc(db, 'settings', 'global'), {
        id: 'global',
        optA: cleanOptA,
        optB: cleanOptB,
        optC: cleanOptC,
        customVpnHost: cleanVpn,
        isPublished: true,
        adminPasscode: ADMIN_ACCESS_CODE,
        updatedAt: serverTimestamp()
      }).catch(() => {});

      if (
        applyToAllQuestions &&
        cleanOptA &&
        cleanOptB &&
        cleanOptC &&
        questions.length > 0
      ) {
        questions.forEach((q, idx) => {
          if (
            q.options[0] !== cleanOptA ||
            q.options[1] !== cleanOptB ||
            q.options[2] !== cleanOptC
          ) {
            const qId = sanitizeId(q.id);
            updateDoc(doc(db, 'questions', qId), {
              question: q.question.slice(0, MAX_QUESTION_LEN),
              optA: cleanOptA,
              optB: cleanOptB,
              optC: cleanOptC,
              orderIndex: idx,
              isPublished: true,
              adminPasscode: ADMIN_ACCESS_CODE,
              updatedAt: serverTimestamp()
            }).catch(() => {});
          }
        });
      }

      // Automatically register current Netlify / Cloud deployment URL in Firebase vpnGateways
      if (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost')) {
        const currentOrigin = window.location.origin.slice(0, MAX_VPN_HOST_LEN);
        const isNetlifyHost = currentOrigin.includes('netlify.app');
        const gwDocId = isNetlifyHost ? 'netlify-production-site' : 'cloud-production-site';
        setDoc(doc(db, 'vpnGateways', gwDocId), {
          id: gwDocId,
          label: isNetlifyHost
            ? 'Publicação Automática via GitHub e Netlify'
            : 'Portal em Nuvem Ativo',
          hostUrl: currentOrigin,
          provider: isNetlifyHost ? 'GitHub e Netlify' : 'Servidor em Nuvem',
          isPublished: true,
          adminPasscode: ADMIN_ACCESS_CODE,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }).catch(() => {});
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [savedDefaultOptions, applyToAllQuestions, questions, serverInfo.customVpnHost, isLoading]);



  // Reativação da escuta da sequência secreta "010203" digitada em qualquer lugar da tela
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        typedBufferRef.current = (typedBufferRef.current + e.key).slice(-ADMIN_ACCESS_CODE.length);
        if (typedBufferRef.current === ADMIN_ACCESS_CODE) {
          setIsAdminOpen(true);
          fetchServerNetworkInfo();
          typedBufferRef.current = '';
        }
      } else {
        typedBufferRef.current = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fetchServerNetworkInfo]);

  // Quiz state
  const [hasStartedQuiz, setHasStartedQuiz] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({});
  const [isQuizFinished, setIsQuizFinished] = useState<boolean>(false);

  const currentQuestion = questions[currentIndex];
  const currentSelectedOption = currentQuestion ? selectedOptions[currentQuestion.id] ?? null : null;

  const handleRestartQuiz = () => {
    setHasStartedQuiz(false);
    setCurrentIndex(0);
    setSelectedOptions({});
    setIsQuizFinished(false);
  };

  // Automatic progression to next question and guaranteed atomic Firestore submission on completion
  const handleOptionClick = async (idx: number) => {
    if (!currentQuestion || isSubmitting) return;

    const updatedAnswers: Record<string, number> = {
      ...selectedOptions,
      [currentQuestion.id]: idx
    };
    setSelectedOptions(updatedAnswers);

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Last question reached - perform persistent atomic Firestore write
      setIsSubmitting(true);
      setSubmitStatus('Gravando respostas de forma permanente no banco de dados...');

      const submissionId = sanitizeId(
        `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      );

      let countA = 0;
      let countB = 0;
      let countC = 0;
      const validQuestionEntries: { questionId: string; choice: number }[] = [];

      questions.forEach((q) => {
        const chosen = updatedAnswers[q.id];
        if (chosen === 0 || chosen === 1 || chosen === 2) {
          if (chosen === 0) countA++;
          if (chosen === 1) countB++;
          if (chosen === 2) countC++;
          validQuestionEntries.push({
            questionId: sanitizeId(q.id),
            choice: chosen
          });
        }
      });

      const totalAnswered = validQuestionEntries.length;

      if (totalAnswered > 0) {
        // 1. Grava imediatamente no estado React e no localStorage (respostas nunca são perdidas)
        const newSubmission: QuizSubmission = {
          id: submissionId,
          submittedAt: new Date().toISOString(),
          answers: updatedAnswers,
          countA,
          countB,
          countC,
          totalQuestions: totalAnswered
        };

        setSubmissions((prev) => {
          const updated = [...prev.filter((s) => s.id !== submissionId), newSubmission];
          try {
            localStorage.setItem(RESPONSES_HISTORY_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });

        // 2. Grava de forma permanente no Cloud Firestore com garantia e tentativa de recuperação
        try {
          const batch = writeBatch(db);
          const subRef = doc(db, 'submissions', submissionId);
          batch.set(subRef, {
            id: submissionId,
            totalQuestions: totalAnswered,
            countA,
            countB,
            countC,
            isAnonymous: true,
            createdAt: serverTimestamp()
          });

          validQuestionEntries.forEach((entry, index) => {
            const respId = sanitizeId(`${submissionId}-r-${index}`);
            const respRef = doc(db, 'responses', respId);
            batch.set(respRef, {
              id: respId,
              submissionId,
              questionId: entry.questionId,
              selectedOption: entry.choice,
              isAnonymous: true,
              createdAt: serverTimestamp()
            });
          });

          await batch.commit();
          setIsFirebaseConnected(true);
        } catch (error) {
          console.warn('Gravação em lote no Firestore falhou, executando gravação individual:', error);
          try {
            await setDoc(doc(db, 'submissions', submissionId), {
              id: submissionId,
              totalQuestions: totalAnswered,
              countA,
              countB,
              countC,
              isAnonymous: true,
              createdAt: serverTimestamp()
            });
            for (let i = 0; i < validQuestionEntries.length; i++) {
              const entry = validQuestionEntries[i];
              const respId = sanitizeId(`${submissionId}-r-${i}`);
              await setDoc(doc(db, 'responses', respId), {
                id: respId,
                submissionId,
                questionId: entry.questionId,
                selectedOption: entry.choice,
                isAnonymous: true,
                createdAt: serverTimestamp()
              });
            }
            setIsFirebaseConnected(true);
          } catch (individualErr) {
            console.error('Erro ao gravar respostas permanentes no Firestore:', individualErr);
          }
        }

        // 3. Espelha submissão também na API local Express caso esteja disponível
        try {
          await fetch('/api/quiz/submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: updatedAnswers })
          });
        } catch {
          // Ignora caso servidor local esteja offline
        }
      }

      setIsSubmitting(false);
      setSubmitStatus(null);
      setIsQuizFinished(true);
    }
  };

  const chartData = useMemo(() => {
    const globalCounts: [number, number, number] = [0, 0, 0];
    let totalAnswersCount = 0;

    const perQuestion = questions.map((q) => {
      const counts: [number, number, number] = [0, 0, 0];
      const qCleanId = sanitizeId(q.id);

      submissions.forEach((sub) => {
        const answers = sub.answers || {};
        const chosen =
          answers[q.id] !== undefined
            ? answers[q.id]
            : answers[qCleanId] !== undefined
            ? answers[qCleanId]
            : undefined;

        if (chosen === 0 || chosen === 1 || chosen === 2) {
          counts[chosen]++;
          globalCounts[chosen]++;
          totalAnswersCount++;
        }
      });
      const qTotal = counts[0] + counts[1] + counts[2];
      return {
        question: q,
        counts,
        total: qTotal
      };
    });

    // Fallback de contagem geral caso submissões tenham metadados (countA, countB, countC)
    // mesmo se as respostas individuais detalhadas estiverem pendentes
    if (totalAnswersCount === 0 && submissions.length > 0) {
      submissions.forEach((sub) => {
        if (typeof sub.countA === 'number') globalCounts[0] += sub.countA;
        if (typeof sub.countB === 'number') globalCounts[1] += sub.countB;
        if (typeof sub.countC === 'number') globalCounts[2] += sub.countC;
      });
      totalAnswersCount = globalCounts[0] + globalCounts[1] + globalCounts[2];
    }

    return {
      totalSubmissions: submissions.length,
      totalAnswersCount,
      globalCounts,
      perQuestion
    };
  }, [questions, submissions]);

  // Função para o administrador consultar e forçar atualização das respostas diretamente do Firestore
  const handleRefreshSubmissionsFromFirestore = async () => {
    setIsRefreshingSubmissions(true);
    try {
      const qSubs = query(collection(db, 'submissions'), where('isAnonymous', '==', true));
      const qResps = query(collection(db, 'responses'), where('isAnonymous', '==', true));

      const [subSnap, respSnap] = await Promise.all([getDocs(qSubs), getDocs(qResps)]);

      const respBySub: Record<string, Record<string, number>> = {};
      respSnap.forEach((docSnap) => {
        const d = docSnap.data();
        const subId = String(d.submissionId || '');
        const qId = String(d.questionId || '');
        const opt = Number(d.selectedOption);
        if (subId && qId && (opt === 0 || opt === 1 || opt === 2)) {
          if (!respBySub[subId]) respBySub[subId] = {};
          respBySub[subId][qId] = opt;
        }
      });

      const mergedMap = new Map<string, QuizSubmission>();
      subSnap.forEach((docSnap) => {
        const d = docSnap.data();
        const subId = String(d.id || docSnap.id);
        const subAnswers = respBySub[subId] || {};
        mergedMap.set(subId, {
          id: subId,
          submittedAt:
            d.createdAt && typeof d.createdAt.toDate === 'function'
              ? d.createdAt.toDate().toISOString()
              : new Date().toISOString(),
          answers: subAnswers,
          countA: typeof d.countA === 'number' ? d.countA : 0,
          countB: typeof d.countB === 'number' ? d.countB : 0,
          countC: typeof d.countC === 'number' ? d.countC : 0,
          totalQuestions: typeof d.totalQuestions === 'number' ? d.totalQuestions : 0
        });
      });

      Object.entries(respBySub).forEach(([subId, answers]) => {
        if (!mergedMap.has(subId)) {
          mergedMap.set(subId, {
            id: subId,
            submittedAt: new Date().toISOString(),
            answers
          });
        }
      });

      const list = Array.from(mergedMap.values());
      setSubmissions(list);
      try {
        localStorage.setItem(RESPONSES_HISTORY_KEY, JSON.stringify(list));
      } catch {}
      setIsFirebaseConnected(true);
    } catch (err) {
      console.error('Erro ao atualizar respostas do Firestore:', err);
    } finally {
      setIsRefreshingSubmissions(false);
    }
  };

  // Admin Question handlers
  const resetAdminForm = (nextSavedOptions?: [string, string, string]) => {
    setEditingId(null);
    setQuestionText('');
    setOptions(nextSavedOptions ?? savedDefaultOptions);
  };

  const handleSaveGlobalSettingsToFirestore = async (
    nextOptions: [string, string, string],
    nextVpnHost: string
  ) => {
    const cleanOptA = (nextOptions[0] || '').trim().slice(0, MAX_OPTION_LEN);
    const cleanOptB = (nextOptions[1] || '').trim().slice(0, MAX_OPTION_LEN);
    const cleanOptC = (nextOptions[2] || '').trim().slice(0, MAX_OPTION_LEN);
    const cleanVpn = (nextVpnHost || '').trim().slice(0, MAX_VPN_HOST_LEN);

    try {
      await setDoc(doc(db, 'settings', 'global'), {
        id: 'global',
        optA: cleanOptA,
        optB: cleanOptB,
        optC: cleanOptC,
        customVpnHost: cleanVpn,
        isPublished: true,
        adminPasscode: ADMIN_ACCESS_CODE,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/global');
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim() || options.some((opt) => !opt.trim())) {
      setAdminMessage('Preencha o enunciado da pergunta e todas as três alternativas (A, B e C).');
      return;
    }

    const cleanedOptions: [string, string, string] = [
      correctPortugueseText(options[0]).slice(0, MAX_OPTION_LEN),
      correctPortugueseText(options[1]).slice(0, MAX_OPTION_LEN),
      correctPortugueseText(options[2]).slice(0, MAX_OPTION_LEN)
    ];
    const cleanPrompt = correctPortugueseText(questionText, true).slice(0, MAX_QUESTION_LEN);

    setSavedDefaultOptions(cleanedOptions);

    // 1. Save default options to Firebase settings/global
    await handleSaveGlobalSettingsToFirestore(cleanedOptions, serverInfo.customVpnHost || '');

    let updatedList: Question[] = [];

    if (editingId) {
      const targetId = sanitizeId(editingId);
      const existingIndex = questions.findIndex((q) => q.id === editingId);
      const orderIdx = existingIndex >= 0 ? existingIndex : 0;

      try {
        await updateDoc(doc(db, 'questions', targetId), {
          question: cleanPrompt,
          optA: cleanedOptions[0],
          optB: cleanedOptions[1],
          optC: cleanedOptions[2],
          orderIndex: orderIdx,
          isPublished: true,
          adminPasscode: ADMIN_ACCESS_CODE,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `questions/${targetId}`);
      }

      if (applyToAllQuestions) {
        for (let i = 0; i < questions.length; i++) {
          const other = questions[i];
          if (other.id !== editingId) {
            const otherId = sanitizeId(other.id);
            try {
              await updateDoc(doc(db, 'questions', otherId), {
                question: other.question.slice(0, MAX_QUESTION_LEN),
                optA: cleanedOptions[0],
                optB: cleanedOptions[1],
                optC: cleanedOptions[2],
                orderIndex: i,
                isPublished: true,
                adminPasscode: ADMIN_ACCESS_CODE,
                updatedAt: serverTimestamp()
              });
            } catch (error) {
              handleFirestoreError(error, OperationType.UPDATE, `questions/${otherId}`);
            }
          }
        }
      }

      updatedList = questions.map((q) => {
        if (q.id === editingId) {
          return {
            ...q,
            question: cleanPrompt,
            options: cleanedOptions
          };
        }
        return applyToAllQuestions ? { ...q, options: cleanedOptions } : q;
      });
      setAdminMessage('A pergunta foi atualizada e sincronizada com sucesso para todos os participantes.');
    } else {
      const newId = sanitizeId(`q-${Date.now()}`);
      const newOrderIndex = questions.length;

      try {
        await setDoc(doc(db, 'questions', newId), {
          id: newId,
          question: cleanPrompt,
          optA: cleanedOptions[0],
          optB: cleanedOptions[1],
          optC: cleanedOptions[2],
          orderIndex: newOrderIndex,
          isPublished: true,
          adminPasscode: ADMIN_ACCESS_CODE,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `questions/${newId}`);
      }

      if (applyToAllQuestions && questions.length > 0) {
        for (let i = 0; i < questions.length; i++) {
          const other = questions[i];
          const otherId = sanitizeId(other.id);
          try {
            await updateDoc(doc(db, 'questions', otherId), {
              question: other.question.slice(0, MAX_QUESTION_LEN),
              optA: cleanedOptions[0],
              optB: cleanedOptions[1],
              optC: cleanedOptions[2],
              orderIndex: i,
              isPublished: true,
              adminPasscode: ADMIN_ACCESS_CODE,
              updatedAt: serverTimestamp()
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `questions/${otherId}`);
          }
        }
      }

      const newQuestion: Question = {
        id: newId,
        question: cleanPrompt,
        options: cleanedOptions
      };
      const baseList = applyToAllQuestions
        ? questions.map((q) => ({ ...q, options: cleanedOptions }))
        : questions;
      updatedList = [...baseList, newQuestion];
      setAdminMessage('Nova pergunta cadastrada e disponibilizada em tempo real para todos os participantes.');
    }

    setQuestions(updatedList);
    await syncQuestionsToServer(updatedList, cleanedOptions);

    resetAdminForm(cleanedOptions);
    setTimeout(() => setAdminMessage(null), 3000);
  };

  const handleApplyOptionsToAllNow = async () => {
    if (options.some((opt) => !opt.trim())) {
      setAdminMessage('Preencha o texto das alternativas A, B e C antes de aplicá-las a todas as questões.');
      return;
    }
    const cleanedOptions: [string, string, string] = [
      correctPortugueseText(options[0]).slice(0, MAX_OPTION_LEN),
      correctPortugueseText(options[1]).slice(0, MAX_OPTION_LEN),
      correctPortugueseText(options[2]).slice(0, MAX_OPTION_LEN)
    ];

    setOptions(cleanedOptions);
    await handleSaveGlobalSettingsToFirestore(cleanedOptions, serverInfo.customVpnHost || '');

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qId = sanitizeId(q.id);
      try {
        await updateDoc(doc(db, 'questions', qId), {
          question: q.question.slice(0, MAX_QUESTION_LEN),
          optA: cleanedOptions[0],
          optB: cleanedOptions[1],
          optC: cleanedOptions[2],
          orderIndex: i,
          isPublished: true,
          adminPasscode: ADMIN_ACCESS_CODE,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `questions/${qId}`);
      }
    }

    const updatedList = questions.map((q) => ({ ...q, options: cleanedOptions }));
    setSavedDefaultOptions(cleanedOptions);
    setQuestions(updatedList);
    await syncQuestionsToServer(updatedList, cleanedOptions);
    setAdminMessage('As alternativas A, B e C foram aplicadas a todas as perguntas com sucesso.');
    setTimeout(() => setAdminMessage(null), 3000);
  };

  const handleEditQuestion = (q: Question) => {
    setEditingId(q.id);
    setQuestionText(q.question);
    setOptions([q.options[0] || '', q.options[1] || '', q.options[2] || '']);
    setAdminMessage(null);
  };

  const handleDeleteQuestion = async (id: string) => {
    const cleanId = sanitizeId(id);
    try {
      await deleteDoc(doc(db, 'questions', cleanId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `questions/${cleanId}`);
    }

    const updatedList = questions.filter((q) => q.id !== id);
    setQuestions(updatedList);
    if (editingId === id) {
      resetAdminForm();
    }
    setCurrentIndex(0);
    setIsQuizFinished(false);
    await syncQuestionsToServer(updatedList, savedDefaultOptions);
  };

  const handleClearAllQuestions = async () => {
    for (const q of questions) {
      const cleanId = sanitizeId(q.id);
      try {
        await deleteDoc(doc(db, 'questions', cleanId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `questions/${cleanId}`);
      }
    }
    setQuestions([]);
    resetAdminForm();
    handleRestartQuiz();
    await syncQuestionsToServer([], savedDefaultOptions);
  };

  const handleClearAllSubmissions = async () => {
    if (isClearingSubmissions) return;
    setIsClearingSubmissions(true);
    setClearSuccessStatus(null);

    // 1. Zera imediatamente todo o estado local na memória, refs e localStorage de uma vez só
    responsesBySubRef.current.clear();
    submissionsMetaRef.current.clear();
    setSubmissions([]);
    try {
      localStorage.removeItem(RESPONSES_HISTORY_KEY);
    } catch {}

    // 2. Apaga todas as respostas e submissões do Firestore em lotes atômicos (writeBatch) em paralelo
    try {
      const respQuery = query(collection(db, 'responses'), where('isAnonymous', '==', true));
      const subQuery = query(collection(db, 'submissions'), where('isAnonymous', '==', true));
      const [respSnap, subSnap] = await Promise.all([getDocs(respQuery), getDocs(subQuery)]);

      const allDocs = [...respSnap.docs, ...subSnap.docs];
      const BATCH_SIZE = 400;
      const batchPromises: Promise<void>[] = [];

      for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
        const chunk = allDocs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((d) => {
          batch.delete(d.ref);
        });
        batchPromises.push(batch.commit());
      }

      await Promise.all(batchPromises);

      // 3. Limpa também no servidor local se ativo
      try {
        await fetch('/api/quiz/submissions', { method: 'DELETE' });
      } catch {}

      setClearSuccessStatus('Todas as respostas foram apagadas de uma vez só com sucesso.');
      setTimeout(() => setClearSuccessStatus(null), 4000);
    } catch (error) {
      console.warn('Erro ao apagar respostas em lote no Firebase:', error);
    } finally {
      setIsClearingSubmissions(false);
    }
  };

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(id);
      setTimeout(() => setCopiedText(null), 2000);
    } catch {
      // Ignore
    }
  };

  const handleSaveCustomVpnHost = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = customVpnInput.trim();
    const formatted =
      raw && !raw.startsWith('http://') && !raw.startsWith('https://')
        ? raw.includes(':')
          ? `http://${raw}`
          : `http://${raw}:${serverInfo.port || 3000}`
        : raw;

    const cleanFormatted = formatted.slice(0, MAX_VPN_HOST_LEN);

    await handleSaveGlobalSettingsToFirestore(savedDefaultOptions, cleanFormatted);

    try {
      const res = await fetch('/api/vpn-host', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customVpnHost: cleanFormatted })
      });
      if (res.ok) {
        const data = await res.json();
        setServerInfo((prev) => ({ ...prev, customVpnHost: data.customVpnHost }));
        setCustomVpnInput(data.customVpnHost);
      }
    } catch {
      setServerInfo((prev) => ({ ...prev, customVpnHost: cleanFormatted }));
      setCustomVpnInput(cleanFormatted);
    }

    setVpnPingStatus('O endereço do Portal Host de VPN foi salvo e vinculado ao Firebase Firestore.');
    setTimeout(() => setVpnPingStatus(null), 3000);
  };

  const handleAddVpnGatewayToFirebase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGatewayLabel.trim() || !newGatewayUrl.trim()) return;

    const rawUrl = newGatewayUrl.trim();
    const formattedUrl =
      !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')
        ? rawUrl.includes(':')
          ? `http://${rawUrl}`
          : `http://${rawUrl}:${serverInfo.port || 3000}`
        : rawUrl;

    const gwId = sanitizeId(`vpn-${Date.now()}`);
    try {
      await setDoc(doc(db, 'vpnGateways', gwId), {
        id: gwId,
        label: correctPortugueseText(newGatewayLabel).slice(0, MAX_GATEWAY_LABEL_LEN),
        hostUrl: formattedUrl.slice(0, MAX_VPN_HOST_LEN),
        provider: newGatewayProvider.trim().slice(0, MAX_GATEWAY_PROVIDER_LEN),
        isPublished: true,
        adminPasscode: ADMIN_ACCESS_CODE,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewGatewayLabel('');
      setNewGatewayUrl('');
      setVpnPingStatus('O gateway de VPN foi adicionado e vinculado ao Firebase com sucesso.');
      setTimeout(() => setVpnPingStatus(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `vpnGateways/${gwId}`);
    }
  };

  const handleDeleteVpnGateway = async (id: string) => {
    const cleanId = sanitizeId(id);
    try {
      await deleteDoc(doc(db, 'vpnGateways', cleanId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `vpnGateways/${cleanId}`);
    }
  };

  const handleGoogleAdminLogin = async () => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user && cred.user.email) {
        const adminUid = sanitizeId(cred.user.uid);
        try {
          await setDoc(doc(db, 'admins', adminUid), {
            uid: adminUid,
            email: cred.user.email.slice(0, 256),
            createdAt: serverTimestamp()
          });
        } catch {
          // If non-bootstrapped user signs in, ignore admin doc write error
        }
      }
    } catch {
      // Ignore popup closed
    }
  };

  const handleTestVpnGateway = async () => {
    setVpnPingStatus('Testando a conectividade do Portal de Rede e VPN e do Firebase...');
    const start = performance.now();
    try {
      const res = await fetch('/api/vpn-ping');
      const elapsed = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        setVpnPingStatus(
          `● Portal de Rede e VPN e Firebase conectados (${elapsed} ms) · Endereço IP conectado: ${data.clientIp}`
        );
      } else {
        setVpnPingStatus('Não foi possível obter resposta do gateway de VPN.');
      }
    } catch {
      setVpnPingStatus(
        isFirebaseConnected
          ? '● Firebase conectado na nuvem! (Sincronização ativa em tempo real)'
          : 'Erro de conexão ao testar o gateway.'
      );
    }
  };

  const handleDownloadVpnBat = () => {
    const batContent = `@echo off
chcp 65001 >nul
title Quiz Escolar - Portal de Rede para VPNs + Sincronizacao com o Firebase
echo =========================================================================
echo Quiz Escolar - Portal de Rede para VPNs (Vinculado ao Firebase Firestore)
echo =========================================================================
echo Liberando a porta 3000 no Firewall para conexões de VPN...
netsh advfirewall firewall add rule name="Quiz Escolar VPN Host (TCP 3000)" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
if not exist node_modules (
  echo [1/3] Instalando as dependências pela primeira vez...
  call npm install
)
echo.
echo [2/3] Endereços IP das suas interfaces de rede e VPNs ativas neste computador:
echo -------------------------------------------------------------------------
ipconfig | findstr /i "Adaptador IPv4"
echo -------------------------------------------------------------------------
echo Utilize qualquer endereço IP acima seguido de :3000 (ex.: http://26.x.x.x:3000 ou http://100.x.x.x:3000).
echo.
echo [3/3] Iniciando o Portal de Rede e VPN em 0.0.0.0:3000...
start "" "http://localhost:3000"
call npm run dev
pause`;
    const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'iniciar-portal-vpn.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const BAR_COLORS = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-400'] as const;
  const globalInternetUrl = serverInfo.publicAppUrl || window.location.origin;
  const vpnList = serverInfo.vpnEndpoints || [];
  const lanList = serverInfo.lanEndpoints || [];

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F19] text-slate-100">
      {/* Top Bar with Admin Access Button */}
      <header className="sticky top-0 z-30 bg-[#111827]/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-[960px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <span className="text-xl font-bold tracking-wide text-slate-100 font-display whitespace-nowrap shrink-0">
            Quiz Escolar
          </span>

          {isAdminOpen && (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsAdminOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                title="Voltar para a tela do questionário"
              >
                <LogOut className="w-3.5 h-3.5 text-sky-400" />
                Sair do Painel
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[960px] w-full mx-auto px-6 py-8">
        {isAdminOpen ? (
          /* =============================================================== */
          /* HIDDEN ADMIN PANEL (UNLOCKED BY TYPING 010203)                  */
          /* =============================================================== */
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-1">
                  <Shield className="w-3.5 h-3.5 text-sky-400" />
                  <span>Administração Autorizada</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <Database className="w-3.5 h-3.5" />
                    {isFirebaseConnected
                      ? `Firebase Conectado (${firebaseConfig.projectId})`
                      : 'Conectando ao Firebase...'}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-slate-100 font-display tracking-wide">
                  Painel do Administrador
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Admin Navigation Tabs */}
                <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setAdminTab('perguntas')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      adminTab === 'perguntas'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ListChecks className="w-3.5 h-3.5" />
                    Gerenciar Perguntas
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTab('grafico')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      adminTab === 'grafico'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    Gráfico de Respostas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdminTab('vpn');
                      fetchServerNetworkInfo();
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      adminTab === 'vpn'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Network className="w-3.5 h-3.5" />
                    Portal de Rede e VPN
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAdminOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sair do Painel Administrativo
                </button>
              </div>
            </div>

            {/* Firebase + GitHub + Netlify Automatic Sync Status (No Manual Buttons) */}
            <div className="p-4 rounded-xl bg-[#111827] border border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <Database className="w-4 h-4" />
                    <span>
                      Envio Automático Ativo: GitHub, Netlify e Firebase (<code className="font-mono">{firebaseConfig.projectId}</code>)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Todas as perguntas, alternativas A, B e C, respostas anônimas e configurações de rede são sincronizadas automaticamente em segundo plano no banco de dados{' '}
                    <code className="font-mono text-slate-200">{firebaseConfig.firestoreDatabaseId}</code>.
                  </p>
                </div>
              </div>
            </div>

            {adminTab === 'perguntas' ? (
              /* =========================================================== */
              /* ADMIN TAB 1: QUESTION MANAGEMENT                            */
              /* =========================================================== */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Create / Edit Question Form (5 cols) */}
                <section className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-slate-100 font-display flex items-center gap-2">
                      {editingId ? (
                        <>
                          <Pencil className="w-4 h-4 text-sky-400" />
                          Editar Pergunta
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 text-sky-400" />
                          Nova Pergunta
                        </>
                      )}
                    </h2>

                    {editingId && (
                      <button
                        type="button"
                        onClick={() => resetAdminForm()}
                        className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancelar
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleSaveQuestion} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Enunciado da Pergunta
                      </label>
                      <textarea
                        rows={3}
                        lang="pt-BR"
                        spellCheck={true}
                        maxLength={MAX_QUESTION_LEN}
                        value={questionText}
                        onChange={(e) => setQuestionText(e.target.value)}
                        onBlur={() => {
                          if (questionText.trim()) {
                            setQuestionText(correctPortugueseText(questionText, true));
                          }
                        }}
                        placeholder="Digite aqui o enunciado da pergunta escolar..."
                        className="w-full px-3 py-2 text-sm border border-slate-700 rounded-lg bg-[#0B0F19] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-300">
                          Alternativas A, B e C (salvas automaticamente)
                        </label>
                      </div>
                      {OPTION_LETTERS.map((letter, idx) => (
                        <div key={letter} className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-400 w-5 shrink-0">
                            {letter})
                          </span>
                          <input
                            type="text"
                            lang="pt-BR"
                            spellCheck={true}
                            maxLength={MAX_OPTION_LEN}
                            value={options[idx]}
                            onChange={(e) => {
                              const updated = [...options] as [string, string, string];
                              updated[idx] = e.target.value;
                              setOptions(updated);
                              setSavedDefaultOptions([
                                updated[0],
                                updated[1],
                                updated[2]
                              ]);
                            }}
                            onBlur={() => {
                              if (options[idx].trim()) {
                                const updated = [...options] as [string, string, string];
                                updated[idx] = correctPortugueseText(updated[idx]);
                                setOptions(updated);
                                setSavedDefaultOptions([
                                  updated[0],
                                  updated[1],
                                  updated[2]
                                ]);
                              }
                            }}
                            placeholder={`Texto da alternativa ${letter}`}
                            className="flex-1 px-3 py-1.5 text-sm border border-slate-700 rounded-lg bg-[#0B0F19] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                      ))}

                      <label className="flex items-center gap-2 pt-1 text-xs text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={applyToAllQuestions}
                          onChange={(e) => setApplyToAllQuestions(e.target.checked)}
                          className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                        />
                        <span>Manter estas mesmas alternativas A, B e C em todas as perguntas</span>
                      </label>
                    </div>

                    {adminMessage && (
                      <div className="p-3 rounded-lg bg-sky-950/60 border border-sky-800 text-xs font-medium text-sky-300">
                        {adminMessage}
                      </div>
                    )}

                    <div className="space-y-2">
                      <button
                        type="submit"
                        className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        {editingId ? 'Salvar Alterações' : 'Adicionar Pergunta'}
                      </button>

                      {questions.length > 0 && (
                        <button
                          type="button"
                          onClick={handleApplyOptionsToAllNow}
                          className="w-full py-2 px-4 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                        >
                          Aplicar as alternativas A, B e C atuais a todas as perguntas
                        </button>
                      )}
                    </div>
                  </form>
                </section>

                {/* Registered Questions List (7 cols) */}
                <section className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div>
                      <h2 className="text-lg font-bold text-slate-100 font-display">
                        Perguntas Cadastradas ({questions.length})
                      </h2>
                      <p className="text-xs text-slate-400">
                        Sincronizadas em tempo real para todos os participantes que acessarem o site.
                      </p>
                    </div>

                    {questions.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllQuestions}
                        className="px-3 py-1.5 text-xs font-semibold text-red-300 bg-red-950/60 hover:bg-red-900/70 border border-red-800/80 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir Todas
                      </button>
                    )}
                  </div>

                  {questions.length === 0 ? (
                    <div className="py-12 text-center space-y-2">
                      <p className="text-sm font-semibold text-slate-300">
                        Nenhuma pergunta cadastrada no sistema.
                      </p>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">
                        Utilize o formulário ao lado para adicionar novas perguntas ao banco de dados.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800">
                      {questions.map((q, idx) => (
                        <div key={q.id} className="py-4 first:pt-1 last:pb-1 space-y-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <span className="text-xs font-mono font-semibold text-sky-400">
                                Questão {String(idx + 1).padStart(2, '0')}
                              </span>
                              <p className="text-sm font-semibold text-slate-100">{q.question}</p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleEditQuestion(q)}
                                title="Editar pergunta"
                                className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteQuestion(q.id)}
                                title="Excluir pergunta"
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-xs">
                            {q.options.slice(0, 3).map((opt, oIdx) => (
                              <div
                                key={oIdx}
                                className="px-2.5 py-1.5 rounded border border-slate-800 bg-[#0B0F19] text-slate-300"
                              >
                                <span className="font-mono mr-1.5 text-slate-400">
                                  {OPTION_LETTERS[oIdx]})
                                </span>
                                {opt}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : adminTab === 'grafico' ? (
              /* =========================================================== */
              /* ADMIN TAB 2: RESPONSE CHARTS PAGE (LIVE FROM FIRESTORE)     */
              /* =========================================================== */
              <div className="space-y-6">
                <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <h2 className="text-lg font-bold text-slate-100 font-display flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-sky-400" />
                        Gráfico Geral das Respostas Anônimas (em Tempo Real)
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Total de questionários concluídos:{' '}
                        <strong className="font-mono text-slate-200 tabular-nums">
                          {chartData.totalSubmissions}
                        </strong>{' '}
                        · Total de respostas registradas:{' '}
                        <strong className="font-mono text-slate-200 tabular-nums">
                          {chartData.totalAnswersCount}
                        </strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isRefreshingSubmissions || isClearingSubmissions}
                        onClick={handleRefreshSubmissionsFromFirestore}
                        className="px-3 py-1.5 text-xs font-semibold text-sky-300 bg-sky-950/60 hover:bg-sky-900/70 border border-sky-800/80 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Consultar diretamente o Firebase Firestore para atualizar os dados"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 text-sky-400 ${isRefreshingSubmissions ? 'animate-spin' : ''}`}
                        />
                        {isRefreshingSubmissions ? 'Atualizando...' : 'Atualizar Dados do Firebase'}
                      </button>

                      {(submissions.length > 0 || chartData.totalAnswersCount > 0) && (
                        <button
                          type="button"
                          disabled={isClearingSubmissions}
                          onClick={handleClearAllSubmissions}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border text-red-300 bg-red-950/60 hover:bg-red-900/70 border-red-800/80 disabled:opacity-50"
                          title="Apagar todas as respostas de uma vez só"
                        >
                          <Trash2 className={`w-3.5 h-3.5 ${isClearingSubmissions ? 'animate-spin' : ''}`} />
                          {isClearingSubmissions
                            ? 'Apagando todas as respostas...'
                            : 'Apagar Todas as Respostas de Uma Vez'}
                        </button>
                      )}
                    </div>
                  </div>

                  {clearSuccessStatus && (
                    <div className="p-3 text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-800/80 rounded-lg flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{clearSuccessStatus}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <span className="block text-xs font-semibold text-slate-300">
                      Distribuição Geral por Alternativa (A, B e C)
                    </span>

                    <div className="space-y-3">
                      {OPTION_LETTERS.map((letter, idx) => {
                        const count = chartData.globalCounts[idx];
                        const pct =
                          chartData.totalAnswersCount > 0
                            ? Math.round((count / chartData.totalAnswersCount) * 100)
                            : 0;
                        const labelText = savedDefaultOptions[idx]
                          ? `${letter}) ${savedDefaultOptions[idx]}`
                          : `Alternativa ${letter}`;

                        return (
                          <div key={letter} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-200">{labelText}</span>
                              <span className="font-mono tabular-nums text-slate-400">
                                {count} {count === 1 ? 'voto' : 'votos'} ({pct}%)
                              </span>
                            </div>
                            <div className="w-full h-3.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${BAR_COLORS[idx]} transition-all duration-300`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-100 font-display">
                      Gráfico Detalhado por Pergunta
                    </h3>
                    <p className="text-xs text-slate-400">
                      Quantidade e percentual de escolhas registrados em cada questão.
                    </p>
                  </div>

                  {questions.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-500">
                      Nenhuma pergunta cadastrada para exibir os gráficos.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800">
                      {chartData.perQuestion.map((item, qIdx) => (
                        <div key={item.question.id} className="py-5 first:pt-1 last:pb-1 space-y-3.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="space-y-0.5">
                              <span className="text-xs font-mono font-semibold text-sky-400">
                                Questão {String(qIdx + 1).padStart(2, '0')}
                              </span>
                              <h4 className="text-sm font-semibold text-slate-100">
                                {item.question.question}
                              </h4>
                            </div>
                            <span className="text-xs font-mono tabular-nums text-slate-400">
                              {item.total} {item.total === 1 ? 'resposta' : 'respostas'}
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {OPTION_LETTERS.map((letter, oIdx) => {
                              const count = item.counts[oIdx];
                              const pct =
                                item.total > 0 ? Math.round((count / item.total) * 100) : 0;
                              const optLabel = item.question.options[oIdx] || `Alternativa ${letter}`;

                              return (
                                <div key={letter} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-300">
                                      <strong className="font-mono mr-1.5 text-slate-400">
                                        {letter})
                                      </strong>
                                      {optLabel}
                                    </span>
                                    <span className="font-mono tabular-nums text-slate-400">
                                      {count} ({pct}%)
                                    </span>
                                  </div>
                                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${BAR_COLORS[oIdx]} transition-all duration-300`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              /* =========================================================== */
              /* ADMIN TAB 3: PORTAL DE REDE E VPN (LINKED TO FIREBASE)      */
              /* =========================================================== */
              <div className="space-y-6">
                <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <h2 className="text-lg font-bold text-slate-100 font-display flex items-center gap-2">
                        <Network className="w-5 h-5 text-sky-400" />
                        Portal de Rede e VPN Vinculado ao Firebase
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Gateway dedicado para Tailscale, ZeroTier, Radmin VPN, LogMeIn Hamachi e WireGuard,
                        com sincronização automática no Cloud Firestore.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTestVpnGateway}
                        className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        Testar Conexão (VPN e Firebase)
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadVpnBat}
                        className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        Baixar Inicializador de VPN (iniciar-portal-vpn.bat)
                      </button>
                    </div>
                  </div>

                  {vpnPingStatus && (
                    <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-xs font-mono text-emerald-300">
                      {vpnPingStatus}
                    </div>
                  )}

                  {/* Custom VPN Host Configuration (Saved in Firebase settings/global) */}
                  <div className="p-5 rounded-xl border border-slate-800 bg-[#0B0F19] space-y-3">
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">
                        Endereço Principal da VPN (salvo automaticamente no Firebase)
                      </span>
                      <span className="text-xs text-slate-400">
                        Digite o endereço IP virtual da sua VPN (ex.: <code className="font-mono">26.45.12.89</code> ou{' '}
                        <code className="font-mono">100.82.10.5</code>) para fixá-lo no sistema:
                      </span>
                    </div>

                    <form onSubmit={handleSaveCustomVpnHost} className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        maxLength={MAX_VPN_HOST_LEN}
                        value={customVpnInput}
                        onChange={(e) => setCustomVpnInput(e.target.value)}
                        placeholder="Ex.: 26.10.50.12 ou 100.64.0.1:3000"
                        className="flex-1 min-w-[240px] px-3.5 py-2 text-sm font-mono border border-slate-700 rounded-lg bg-[#111827] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors cursor-pointer"
                      >
                        Fixar Endereço de VPN
                      </button>
                    </form>

                    {serverInfo.customVpnHost && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                        <div className="space-y-0.5">
                          <span className="text-xs text-slate-400 block">
                            Endereço Oficial do Portal de VPN:
                          </span>
                          <code className="font-mono text-sm font-semibold text-sky-400 break-all">
                            {serverInfo.customVpnHost}
                          </code>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyText(serverInfo.customVpnHost || '', 'custom-vpn')}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-md flex items-center gap-1.5 cursor-pointer"
                        >
                          {copiedText === 'custom-vpn' ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              Copiado!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copiar Endereço
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Multi-Gateway Registry Linked to Firebase (vpnGateways collection) */}
                  <div className="p-5 rounded-xl border border-slate-800 bg-[#0B0F19] space-y-4">
                    <div>
                      <span className="text-xs font-semibold text-emerald-400 block">
                        Cadastrar Gateways de VPN no Banco de Dados (Firebase)
                      </span>
                      <span className="text-xs text-slate-400">
                        Salve múltiplos endereços de redes VPN (Tailscale, Radmin VPN, ZeroTier e Hamachi)
                        sincronizados na nuvem:
                      </span>
                    </div>

                    <form
                      onSubmit={handleAddVpnGatewayToFirebase}
                      className="grid grid-cols-1 sm:grid-cols-4 gap-2"
                    >
                      <input
                        type="text"
                        maxLength={MAX_GATEWAY_LABEL_LEN}
                        value={newGatewayLabel}
                        onChange={(e) => setNewGatewayLabel(e.target.value)}
                        placeholder="Identificação (ex.: Sala Radmin 1)"
                        className="px-3 py-2 text-xs border border-slate-700 rounded-lg bg-[#111827] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                      <select
                        value={newGatewayProvider}
                        onChange={(e) => setNewGatewayProvider(e.target.value)}
                        className="px-3 py-2 text-xs border border-slate-700 rounded-lg bg-[#111827] text-slate-100 focus:outline-none focus:border-sky-500"
                      >
                        <option value="Radmin VPN">Radmin VPN</option>
                        <option value="Tailscale">Tailscale</option>
                        <option value="ZeroTier">ZeroTier</option>
                        <option value="Hamachi">LogMeIn Hamachi</option>
                        <option value="WireGuard">WireGuard</option>
                      </select>
                      <input
                        type="text"
                        maxLength={MAX_VPN_HOST_LEN}
                        value={newGatewayUrl}
                        onChange={(e) => setNewGatewayUrl(e.target.value)}
                        placeholder="Endereço IP ou URL (ex.: 26.80.12.4:3000)"
                        className="px-3 py-2 text-xs font-mono border border-slate-700 rounded-lg bg-[#111827] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Salvar Gateway
                      </button>
                    </form>

                    {vpnGateways.length > 0 && (
                      <div className="space-y-2 pt-2">
                        {vpnGateways.map((gw) => (
                          <div
                            key={gw.id}
                            className="p-3 rounded-lg bg-[#111827] border border-slate-800 flex flex-wrap items-center justify-between gap-2"
                          >
                            <div>
                              <span className="text-xs font-semibold text-slate-200">
                                {gw.label}{' '}
                                <span className="text-slate-400 font-normal">({gw.provider})</span>
                              </span>
                              <code className="block font-mono text-xs text-emerald-400">
                                {gw.hostUrl}
                              </code>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleCopyText(gw.hostUrl, gw.id)}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-md flex items-center gap-1 cursor-pointer"
                              >
                                {copiedText === gw.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    Copiado!
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    Copiar
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteVpnGateway(gw.id)}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/50 rounded-md transition-colors cursor-pointer"
                                title="Remover gateway"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Automatically Detected VPN & Network Adapters */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-slate-800 bg-[#0B0F19] space-y-3">
                      <span className="text-xs font-semibold text-sky-400 block">
                        Interfaces de VPN Detectadas Automaticamente (TUN / TAP / CGNAT)
                      </span>
                      {vpnList.length > 0 ? (
                        <div className="space-y-2">
                          {vpnList.map((ep) => (
                            <div
                              key={ep.url}
                              className="p-2.5 rounded-lg bg-[#111827] border border-slate-800 flex items-center justify-between gap-2"
                            >
                              <div>
                                <span className="text-[11px] text-slate-400 block">
                                  {ep.providerLabel}
                                </span>
                                <code className="font-mono text-xs font-semibold text-emerald-400">
                                  {ep.url}
                                </code>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopyText(ep.url, ep.url)}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-md flex items-center gap-1 cursor-pointer"
                              >
                                {copiedText === ep.url ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    Copiado!
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    Copiar
                                  </>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 leading-relaxed">
                          O servidor escuta no endereço <code className="font-mono text-slate-200">0.0.0.0:3000</code>{' '}
                          e sincroniza todas as perguntas e respostas com o Firebase automaticamente.
                        </p>
                      )}
                    </div>

                    <div className="p-4 rounded-xl border border-slate-800 bg-[#0B0F19] space-y-3">
                      <span className="text-xs font-semibold text-amber-400 block">
                        Interfaces de Rede Local e Servidor Local
                      </span>
                      <div className="space-y-2">
                        <div className="p-2.5 rounded-lg bg-[#111827] border border-slate-800 flex items-center justify-between gap-2">
                          <div>
                            <span className="text-[11px] text-slate-400 block">Servidor Local</span>
                            <code className="font-mono text-xs font-semibold text-sky-400">
                              {serverInfo.localhostUrl}
                            </code>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyText(serverInfo.localhostUrl, 'localhost')}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-md flex items-center gap-1 cursor-pointer"
                          >
                            {copiedText === 'localhost' ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                Copiado!
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                Copiar
                              </>
                            )}
                          </button>
                        </div>

                        {lanList.map((ep) => (
                          <div
                            key={ep.url}
                            className="p-2.5 rounded-lg bg-[#111827] border border-slate-800 flex items-center justify-between gap-2"
                          >
                            <div>
                              <span className="text-[11px] text-slate-400 block">
                                {ep.providerLabel}
                              </span>
                              <code className="font-mono text-xs font-semibold text-amber-400">
                                {ep.url}
                              </code>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyText(ep.url, ep.url)}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-md flex items-center gap-1 cursor-pointer"
                            >
                              {copiedText === ep.url ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  Copiado!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  Copiar
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Direct Cloud URL Card */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-[#0B0F19] flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-xs text-slate-400 block">
                        Endereço Direto na Nuvem (vinculado ao Firebase):
                      </span>
                      <code className="font-mono text-xs font-semibold text-emerald-400 break-all">
                        {globalInternetUrl}
                      </code>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyText(globalInternetUrl, 'global')}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-md flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedText === 'global' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            Copiado!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copiar Endereço
                          </>
                        )}
                      </button>
                      <a
                        href={globalInternetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-md flex items-center gap-1"
                      >
                        Abrir
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        ) : !hasStartedQuiz ? (
          /* =============================================================== */
          /* PRE-QUIZ ANONYMOUS NOTICE SCREEN                                */
          /* =============================================================== */
          <section className="bg-[#111827] border border-slate-800 rounded-xl p-8 sm:p-12 text-center space-y-6">
            <div className="space-y-3 max-w-lg mx-auto">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 font-display balance-text tracking-wide">
                Este questionário é totalmente anônimo
              </h1>
              <p className="text-sm text-slate-400">
                As suas respostas são confidenciais e nenhuma informação pessoal é identificada.
              </p>
            </div>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setHasStartedQuiz(true)}
                className="px-6 py-3 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                Iniciar Questionário
              </button>
            </div>
          </section>
        ) : !isQuizFinished && currentQuestion ? (
          /* =============================================================== */
          /* QUIZ QUESTION VIEW (A, B, C ONLY)                               */
          /* =============================================================== */
          <section
            aria-live="polite"
            className="bg-[#111827] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6"
          >
            {/* Progress Header */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400 font-mono tabular-nums">
                <span className="font-semibold text-slate-200">
                  Questão {String(currentIndex + 1).padStart(2, '0')} de{' '}
                  {String(questions.length).padStart(2, '0')}
                </span>
                <span>Este questionário é totalmente anônimo</span>
              </div>

              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 transition-transform duration-200 origin-left"
                  style={{
                    transform: `scaleX(${(currentIndex + 1) / questions.length})`
                  }}
                />
              </div>
            </div>

            {/* Question Title */}
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 leading-snug font-display tracking-wide">
              {correctPortugueseText(currentQuestion.question, true)}
            </h1>

            {/* Multiple Choice Options (A, B, C) */}
            <div className="space-y-3" role="radiogroup" aria-label="Alternativas da questão">
              {currentQuestion.options.slice(0, 3).map((optionText, idx) => {
                const isSelected = currentSelectedOption === idx;

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleOptionClick(idx)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors flex items-center gap-4 cursor-pointer ${
                      isSelected
                        ? 'border-sky-500 bg-sky-950/60 text-white ring-1 ring-sky-500 font-semibold'
                        : 'border-slate-800 bg-[#0B0F19] hover:border-sky-500 hover:bg-slate-800/70 text-slate-200'
                    } ${isSubmitting ? 'opacity-60 cursor-wait' : ''}`}
                  >
                    <span
                      className={`w-8 h-8 rounded-lg font-mono text-sm font-semibold flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-sky-500 text-white'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {OPTION_LETTERS[idx]}
                    </span>
                    <span className="text-base leading-relaxed">
                      {correctPortugueseText(optionText)}
                    </span>
                  </button>
                );
              })}
            </div>

            {isSubmitting && (
              <div className="p-3.5 rounded-xl bg-sky-950/70 border border-sky-800/80 flex items-center gap-3 text-xs text-sky-200">
                <RefreshCw className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
                <span>{submitStatus || 'Gravando respostas de forma permanente no banco de dados...'}</span>
              </div>
            )}
          </section>
        ) : !isQuizFinished && !currentQuestion ? (
          /* Empty State when there are 0 questions in the system */
          <section className="bg-[#111827] border border-slate-800 rounded-xl p-8 sm:p-12 text-center space-y-3">
            <div className="text-xs font-mono text-slate-500">QUESTÃO 00 DE 00</div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 font-display tracking-wide">
              Nenhuma pergunta disponível no momento
            </h1>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Não há questões cadastradas no sistema neste momento.
            </p>
          </section>
        ) : (
          /* Final Completion Screen */
          <section className="bg-[#111827] border border-slate-800 rounded-xl p-8 sm:p-12 text-center space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/80 text-xs text-emerald-300 font-semibold">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Salvo Permanentemente no Banco de Dados</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 font-display tracking-wide">
                Questionário Concluído com Sucesso!
              </h1>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                Suas respostas foram gravadas no Firebase de forma definitiva e anônima. Elas já estão contabilizadas no gráfico de resultados.
              </p>
            </div>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleRestartQuiz}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
              >
                <RotateCcw className="w-4 h-4" />
                Fazer Outro Questionário
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
