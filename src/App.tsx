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
  Globe,
  Copy,
  Check,
  Download,
  ExternalLink
} from 'lucide-react';
import { INITIAL_QUESTIONS, Question } from './data/questions';

const OPTION_LETTERS = ['A', 'B', 'C'] as const;
const STORAGE_KEY = 'quiz_escolar_questions_v1';
const SAVED_OPTIONS_KEY = 'quiz_escolar_saved_options_v1';
const RESPONSES_HISTORY_KEY = 'quiz_escolar_responses_history_v1';
const ADMIN_ACCESS_CODE = '010203';

export interface QuizSubmission {
  id: string;
  submittedAt: string;
  answers: Record<string, number>; // questionId -> optionIndex (0, 1, or 2)
}

interface ServerInfo {
  localhostUrl: string;
  networkUrls: string[];
  publicAppUrl?: string;
  port: number;
}

export default function App() {
  const [questions, setQuestions] = useState<Question[]>(INITIAL_QUESTIONS);
  const [savedDefaultOptions, setSavedDefaultOptions] = useState<[string, string, string]>([
    '',
    '',
    ''
  ]);
  const [submissions, setSubmissions] = useState<QuizSubmission[]>([]);
  const [serverInfo, setServerInfo] = useState<ServerInfo>(() => ({
    localhostUrl: 'http://localhost:3000',
    networkUrls: [],
    publicAppUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    port: 3000
  }));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [adminTab, setAdminTab] = useState<'perguntas' | 'grafico' | 'localhost'>('perguntas');
  const typedBufferRef = useRef<string>('');

  // Admin Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState<string>('');
  const [options, setOptions] = useState<[string, string, string]>(['', '', '']);
  const [applyToAllQuestions, setApplyToAllQuestions] = useState<boolean>(true);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);

  // Sync helper to persist changes to the shared server
  const syncQuestionsToServer = useCallback(
    async (nextQuestions: Question[], nextSavedOptions: [string, string, string]) => {
      try {
        const res = await fetch('/api/quiz/questions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questions: nextQuestions,
            savedDefaultOptions: nextSavedOptions
          })
        });
        if (res.ok) {
          const data = await res.json();
          setQuestions(data.questions || nextQuestions);
          setSavedDefaultOptions(data.savedDefaultOptions || nextSavedOptions);
        }
      } catch {
        // Ignore network errors
      }
    },
    []
  );

  // Fetch shared questions & responses from backend on load
  const fetchSharedQuizData = useCallback(
    async (isInitial = false) => {
      try {
        const [quizRes, infoRes] = await Promise.all([
          fetch('/api/quiz'),
          fetch('/api/server-info')
        ]);

        if (infoRes.ok) {
          const infoData = await infoRes.json();
          setServerInfo({
            ...infoData,
            publicAppUrl:
              infoData.publicAppUrl && !infoData.publicAppUrl.includes('localhost')
                ? infoData.publicAppUrl
                : window.location.origin
          });
        }

        if (!quizRes.ok) return;
        const serverData = await quizRes.json();

        if (isInitial && Array.isArray(serverData.questions) && serverData.questions.length === 0) {
          const localQuestionsRaw = localStorage.getItem(STORAGE_KEY);
          const localOptionsRaw = localStorage.getItem(SAVED_OPTIONS_KEY);
          const localQuestions = localQuestionsRaw ? JSON.parse(localQuestionsRaw) : [];
          const localOptions = localOptionsRaw ? JSON.parse(localOptionsRaw) : ['', '', ''];

          if (Array.isArray(localQuestions) && localQuestions.length > 0) {
            const normalizedOptions: [string, string, string] =
              Array.isArray(localOptions) && localOptions.length >= 3
                ? [
                    String(localOptions[0] || ''),
                    String(localOptions[1] || ''),
                    String(localOptions[2] || '')
                  ]
                : ['', '', ''];

            await syncQuestionsToServer(localQuestions, normalizedOptions);
            setQuestions(localQuestions);
            setSavedDefaultOptions(normalizedOptions);
            setOptions(normalizedOptions);
            return;
          }
        }

        if (Array.isArray(serverData.questions)) {
          setQuestions(serverData.questions);
        }
        if (
          Array.isArray(serverData.savedDefaultOptions) &&
          serverData.savedDefaultOptions.length >= 3
        ) {
          const nextSaved: [string, string, string] = [
            String(serverData.savedDefaultOptions[0] || ''),
            String(serverData.savedDefaultOptions[1] || ''),
            String(serverData.savedDefaultOptions[2] || '')
          ];
          setSavedDefaultOptions(nextSaved);
          if (isInitial) {
            setOptions(nextSaved);
          }
        }
        if (Array.isArray(serverData.submissions)) {
          setSubmissions(serverData.submissions);
        }
      } catch {
        if (isInitial) {
          const localQuestionsRaw = localStorage.getItem(STORAGE_KEY);
          if (localQuestionsRaw) {
            try {
              setQuestions(JSON.parse(localQuestionsRaw));
            } catch {
              // Ignore
            }
          }
        }
      } finally {
        if (isInitial) setIsLoading(false);
      }
    },
    [syncQuestionsToServer]
  );

  useEffect(() => {
    fetchSharedQuizData(true);
    const interval = setInterval(() => {
      if (!isAdminOpen) {
        fetchSharedQuizData(false);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchSharedQuizData, isAdminOpen]);

  useEffect(() => {
    if (!isLoading) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
        localStorage.setItem(SAVED_OPTIONS_KEY, JSON.stringify(savedDefaultOptions));
        localStorage.setItem(RESPONSES_HISTORY_KEY, JSON.stringify(submissions));
      } catch {
        // Ignore storage errors
      }
    }
  }, [questions, savedDefaultOptions, submissions, isLoading]);

  // Listen for the secret sequence "010203" typed anywhere on the page
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
          fetchSharedQuizData(false);
          typedBufferRef.current = '';
        }
      } else {
        typedBufferRef.current = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fetchSharedQuizData]);

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
    fetchSharedQuizData(false);
  };

  const handleOptionClick = async (idx: number) => {
    if (!currentQuestion) return;
    const updatedAnswers = {
      ...selectedOptions,
      [currentQuestion.id]: idx
    };
    setSelectedOptions(updatedAnswers);

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsQuizFinished(true);
      try {
        const res = await fetch('/api/quiz/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: updatedAnswers })
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.submissions)) {
            setSubmissions(data.submissions);
          }
        }
      } catch {
        setSubmissions((prev) => [
          ...prev,
          {
            id: `sub-${Date.now()}`,
            submittedAt: new Date().toISOString(),
            answers: updatedAnswers
          }
        ]);
      }
    }
  };

  const chartData = useMemo(() => {
    const globalCounts: [number, number, number] = [0, 0, 0];
    let totalAnswersCount = 0;

    const perQuestion = questions.map((q) => {
      const counts: [number, number, number] = [0, 0, 0];
      submissions.forEach((sub) => {
        const chosen = sub.answers[q.id];
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

    return {
      totalSubmissions: submissions.length,
      totalAnswersCount,
      globalCounts,
      perQuestion
    };
  }, [questions, submissions]);

  // Admin Question handlers
  const resetAdminForm = (nextSavedOptions?: [string, string, string]) => {
    setEditingId(null);
    setQuestionText('');
    setOptions(nextSavedOptions ?? savedDefaultOptions);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim() || options.some((opt) => !opt.trim())) {
      setAdminMessage('Preencha o enunciado da pergunta e todas as 3 alternativas (A, B e C).');
      return;
    }

    const cleanedOptions: [string, string, string] = [
      options[0].trim(),
      options[1].trim(),
      options[2].trim()
    ];

    setSavedDefaultOptions(cleanedOptions);

    let updatedList: Question[] = [];

    if (editingId) {
      updatedList = questions.map((q) => {
        if (q.id === editingId) {
          return {
            ...q,
            question: questionText.trim(),
            options: cleanedOptions
          };
        }
        return applyToAllQuestions ? { ...q, options: cleanedOptions } : q;
      });
      setAdminMessage(
        applyToAllQuestions
          ? 'Pergunta atualizada e publicada para todos os usuários!'
          : 'Pergunta atualizada com sucesso para todos!'
      );
    } else {
      const newQuestion: Question = {
        id: `q-${Date.now()}`,
        question: questionText.trim(),
        options: cleanedOptions
      };
      const baseList = applyToAllQuestions
        ? questions.map((q) => ({ ...q, options: cleanedOptions }))
        : questions;
      updatedList = [...baseList, newQuestion];
      setAdminMessage('Nova pergunta cadastrada e disponível para todos os usuários!');
    }

    setQuestions(updatedList);
    await syncQuestionsToServer(updatedList, cleanedOptions);

    resetAdminForm(cleanedOptions);
    setTimeout(() => setAdminMessage(null), 3000);
  };

  const handleApplyOptionsToAllNow = async () => {
    if (options.some((opt) => !opt.trim())) {
      setAdminMessage('Preencha o texto das alternativas A, B e C antes de salvar para todas.');
      return;
    }
    const cleanedOptions: [string, string, string] = [
      options[0].trim(),
      options[1].trim(),
      options[2].trim()
    ];
    const updatedList = questions.map((q) => ({ ...q, options: cleanedOptions }));
    setSavedDefaultOptions(cleanedOptions);
    setQuestions(updatedList);
    await syncQuestionsToServer(updatedList, cleanedOptions);
    setAdminMessage('As alternativas A, B e C foram salvas em todas as perguntas para todos!');
    setTimeout(() => setAdminMessage(null), 3000);
  };

  const handleEditQuestion = (q: Question) => {
    setEditingId(q.id);
    setQuestionText(q.question);
    setOptions([q.options[0] || '', q.options[1] || '', q.options[2] || '']);
    setAdminMessage(null);
  };

  const handleDeleteQuestion = async (id: string) => {
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
    setQuestions([]);
    resetAdminForm();
    handleRestartQuiz();
    await syncQuestionsToServer([], savedDefaultOptions);
  };

  const handleClearAllSubmissions = async () => {
    setSubmissions([]);
    try {
      await fetch('/api/quiz/submissions', { method: 'DELETE' });
    } catch {
      // Ignore network error
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

  const handleDownloadUniversalBat = () => {
    const batContent = `@echo off
chcp 65001 >nul
title Quiz Escolar - Localhost + Qualquer Internet (Global)
echo ====================================================================
echo Quiz Escolar - Iniciador Universal (Localhost + Qualquer Internet)
echo ====================================================================
if not exist node_modules (
  echo [1/3] Instalando dependencias pela primeira vez...
  call npm install
)
echo [2/3] Iniciando o servidor local na porta 3000...
start "Quiz Escolar - Servidor Local" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
echo.
echo [3/3] Gerando link publico gratuito para abrir em QUALQUER INTERNET (4G/5G/Wi-Fi)...
echo Copie o link "https://...trycloudflare.com" que aparecer abaixo:
echo.
call npx --yes cloudflared tunnel --url http://localhost:3000
pause`;
    const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'iniciar-qualquer-internet.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const BAR_COLORS = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-400'] as const;
  const globalInternetUrl = serverInfo.publicAppUrl || window.location.origin;

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F19] text-slate-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[#111827]/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-[960px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <span className="text-xl font-bold tracking-wide text-slate-100 font-display whitespace-nowrap shrink-0">
            Quiz Escolar
          </span>

          <button
            type="button"
            onClick={handleRestartQuiz}
            className="px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-800/80 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reiniciar Quiz
          </button>
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
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  <Shield className="w-3.5 h-3.5 text-sky-400" />
                  <span>Administração Autorizada · Sincronizado em Qualquer Rede</span>
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
                    onClick={() => {
                      setAdminTab('grafico');
                      fetchSharedQuizData(false);
                    }}
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
                      setAdminTab('localhost');
                      fetchSharedQuizData(false);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      adminTab === 'localhost'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Link Universal / Localhost
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAdminOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sair do Painel Admin
                </button>
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
                        value={questionText}
                        onChange={(e) => setQuestionText(e.target.value)}
                        placeholder="Digite a pergunta escolar aqui..."
                        className="w-full px-3 py-2 text-sm border border-slate-700 rounded-lg bg-[#0B0F19] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-300">
                          Alternativas A, B e C (Salvas automaticamente)
                        </label>
                      </div>
                      {OPTION_LETTERS.map((letter, idx) => (
                        <div key={letter} className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-400 w-5 shrink-0">
                            {letter})
                          </span>
                          <input
                            type="text"
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
                            placeholder={`Alternativa ${letter}`}
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
                          Aplicar A, B e C atuais em todas as perguntas agora
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
                        Visíveis automaticamente para todos que abrirem o site
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
                        Nenhuma pergunta cadastrada.
                      </p>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">
                        Use o formulário ao lado para adicionar perguntas ao sistema.
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
              /* ADMIN TAB 2: RESPONSE CHARTS PAGE                           */
              /* =========================================================== */
              <div className="space-y-6">
                <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <h2 className="text-lg font-bold text-slate-100 font-display flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-sky-400" />
                        Gráfico Geral das Respostas Anônimas
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Total de questionários finalizados:{' '}
                        <strong className="font-mono text-slate-200 tabular-nums">
                          {chartData.totalSubmissions}
                        </strong>{' '}
                        · Total de respostas registradas:{' '}
                        <strong className="font-mono text-slate-200 tabular-nums">
                          {chartData.totalAnswersCount}
                        </strong>
                      </p>
                    </div>

                    {submissions.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllSubmissions}
                        className="px-3 py-1.5 text-xs font-semibold text-red-300 bg-red-950/60 hover:bg-red-900/70 border border-red-800/80 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Zerar Respostas do Gráfico
                      </button>
                    )}
                  </div>

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
                      Quantidade e porcentagem de escolhas em cada questão cadastrada
                    </p>
                  </div>

                  {questions.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-500">
                      Nenhuma pergunta cadastrada para exibir gráficos.
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
              /* ADMIN TAB 3: UNIVERSAL LOCALHOST & ANY INTERNET ACCESS      */
              /* =========================================================== */
              <div className="space-y-6">
                <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <h2 className="text-lg font-bold text-slate-100 font-display flex items-center gap-2">
                        <Globe className="w-5 h-5 text-sky-400" />
                        Acesso Universal — Qualquer Local e Qualquer Internet
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Compartilhe o link público para abrir em qualquer celular ou computador (4G, 5G ou
                        qualquer Wi-Fi), ou rode pelo túnel Localhost.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleDownloadUniversalBat}
                      className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      Baixar Iniciador Global (iniciar-qualquer-internet.bat)
                    </button>
                  </div>

                  {/* Primary Global Link Card */}
                  <div className="p-5 rounded-xl border border-sky-800/80 bg-sky-950/30 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-sky-300">
                        1. Link Direto na Nuvem (Funciona agora em qualquer internet / 4G / 5G / Wi-Fi)
                      </span>
                      <a
                        href={globalInternetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
                      >
                        Abrir em nova guia
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0B0F19] p-3 rounded-lg border border-slate-800">
                      <code className="font-mono text-sm font-semibold text-emerald-400 break-all">
                        {globalInternetUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyText(globalInternetUrl, 'global')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        {copiedText === 'global' ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Link Copiado!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copiar Link Global
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Localhost & LAN Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-slate-800 bg-[#0B0F19] space-y-2">
                      <span className="text-xs font-semibold text-slate-400 block">
                        2. Endereço Localhost (No seu Computador)
                      </span>
                      <div className="flex items-center justify-between gap-2">
                        <code className="font-mono text-sm font-semibold text-sky-400">
                          {serverInfo.localhostUrl}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyText(serverInfo.localhostUrl, 'localhost')}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-md flex items-center gap-1 cursor-pointer"
                        >
                          {copiedText === 'localhost' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copiar
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-800 bg-[#0B0F19] space-y-2">
                      <span className="text-xs font-semibold text-slate-400 block">
                        3. Endereço na Rede Local (Mesmo Wi-Fi / Rádio Escolar)
                      </span>
                      {serverInfo.networkUrls.length > 0 ? (
                        serverInfo.networkUrls.map((url) => (
                          <div key={url} className="flex items-center justify-between gap-2">
                            <code className="font-mono text-sm font-semibold text-amber-400">
                              {url}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopyText(url, url)}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-md flex items-center gap-1 cursor-pointer"
                            >
                              {copiedText === url ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  Copiado
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  Copiar
                                </>
                              )}
                            </button>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500 font-mono">
                          http://0.0.0.0:3000 (Aberto para todas as placas de rede)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tunnel Instructions for running Localhost across ANY Internet */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-bold text-slate-100 font-display">
                      Como abrir o seu Localhost em qualquer lugar e qualquer internet (4G/5G/Outra Cidade):
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      O servidor já está configurado com <code className="font-mono text-slate-200">host: 0.0.0.0</code>,{' '}
                      <code className="font-mono text-slate-200">CORS liberado</code> e{' '}
                      <code className="font-mono text-slate-200">allowedHosts: true</code>. Quando você rodar no seu PC,
                      basta clicar duas vezes em <code className="font-mono text-slate-200">iniciar-qualquer-internet.bat</code>{' '}
                      (ou rodar o comando abaixo) para gerar um link público <code className="font-mono text-slate-200">https://</code> gratuito:
                    </p>

                    <pre className="p-4 rounded-xl bg-[#0B0F19] border border-slate-800 text-slate-200 font-mono text-xs overflow-x-auto leading-relaxed">
{`# 1. Inicia o servidor local (http://localhost:3000)
npm run dev

# 2. Em outro terminal (ou pelo arquivo iniciar-qualquer-internet.bat),
# gera o link público que abre em QUALQUER INTERNET (4G/5G/Wi-Fi):
npx --yes cloudflared tunnel --url http://localhost:3000`}
                    </pre>
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
                Esse questionário é totalmente anônimo
              </h1>
              <p className="text-sm text-slate-400">
                Suas respostas são confidenciais e nenhuma informação pessoal é identificada.
              </p>
            </div>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => {
                  fetchSharedQuizData(false);
                  setHasStartedQuiz(true);
                }}
                className="px-6 py-3 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                Iniciar Quiz
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
                <span>Esse questionário é totalmente anônimo</span>
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
              {currentQuestion.question}
            </h1>

            {/* Multiple Choice Options (A, B, C) */}
            <div className="space-y-3" role="radiogroup" aria-label="Alternativas da questão">
              {currentQuestion.options.slice(0, 3).map((optionText, idx) => {
                const isSelected = currentSelectedOption === idx;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleOptionClick(idx)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors flex items-center gap-4 cursor-pointer ${
                      isSelected
                        ? 'border-sky-500 bg-sky-950/60 text-white ring-1 ring-sky-500 font-semibold'
                        : 'border-slate-800 bg-[#0B0F19] hover:border-sky-500 hover:bg-slate-800/70 text-slate-200'
                    }`}
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
                    <span className="text-base leading-relaxed">{optionText}</span>
                  </button>
                );
              })}
            </div>
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
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                <Award className="w-4 h-4 text-sky-400" />
                <span>Concluído</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-100 font-display tracking-wide">
                Quiz Concluído!
              </h1>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Suas respostas anônimas foram registradas com sucesso.
              </p>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleRestartQuiz}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Reiniciar Quiz
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
