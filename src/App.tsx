/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  RotateCcw,
  ArrowRight,
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
  ListChecks
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

export default function App() {
  const [questions, setQuestions] = useState<Question[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((q) => ({
            ...q,
            options: Array.isArray(q.options) ? q.options.slice(0, 3) : ['', '', '']
          })) as Question[];
        }
      }
    } catch {
      // Fallback to initial questions
    }
    return INITIAL_QUESTIONS;
  });

  // Saved global A, B, C options text so they persist across all questions
  const [savedDefaultOptions, setSavedDefaultOptions] = useState<[string, string, string]>(() => {
    try {
      const savedOpts = localStorage.getItem(SAVED_OPTIONS_KEY);
      if (savedOpts) {
        const parsed = JSON.parse(savedOpts);
        if (Array.isArray(parsed) && parsed.length >= 3) {
          return [String(parsed[0] || ''), String(parsed[1] || ''), String(parsed[2] || '')];
        }
      }
    } catch {
      // Ignore storage errors
    }
    return ['', '', ''];
  });

  // Anonymous response history for Admin Charts
  const [submissions, setSubmissions] = useState<QuizSubmission[]>(() => {
    try {
      const saved = localStorage.getItem(RESPONSES_HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
    } catch {
      // Ignore storage errors
    }
  }, [questions]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_OPTIONS_KEY, JSON.stringify(savedDefaultOptions));
    } catch {
      // Ignore storage errors
    }
  }, [savedDefaultOptions]);

  useEffect(() => {
    try {
      localStorage.setItem(RESPONSES_HISTORY_KEY, JSON.stringify(submissions));
    } catch {
      // Ignore storage errors
    }
  }, [submissions]);

  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [adminTab, setAdminTab] = useState<'perguntas' | 'grafico'>('perguntas');
  const typedBufferRef = useRef<string>('');

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
          typedBufferRef.current = '';
        }
      } else {
        typedBufferRef.current = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Quiz state
  const [hasStartedQuiz, setHasStartedQuiz] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({});
  const [isQuizFinished, setIsQuizFinished] = useState<boolean>(false);

  // Admin Form state (options A, B, C stay populated with savedDefaultOptions)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState<string>('');
  const [options, setOptions] = useState<[string, string, string]>(savedDefaultOptions);
  const [applyToAllQuestions, setApplyToAllQuestions] = useState<boolean>(true);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);

  const currentQuestion = questions[currentIndex];
  const currentSelectedOption = currentQuestion ? selectedOptions[currentQuestion.id] ?? null : null;

  const handleRestartQuiz = () => {
    setHasStartedQuiz(false);
    setCurrentIndex(0);
    setSelectedOptions({});
    setIsQuizFinished(false);
  };

  const handleOptionClick = (idx: number) => {
    if (!currentQuestion) return;
    setSelectedOptions((prev) => ({
      ...prev,
      [currentQuestion.id]: idx
    }));
  };

  const handleNextQuestion = () => {
    if (currentSelectedOption === null) return;
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Record anonymous submission for Admin Charts
      const newSubmission: QuizSubmission = {
        id: `sub-${Date.now()}`,
        submittedAt: new Date().toISOString(),
        answers: { ...selectedOptions }
      };
      setSubmissions((prev) => [...prev, newSubmission]);
      setIsQuizFinished(true);
    }
  };

  // Compute global and per-question response stats for Admin Chart page
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

  const handleSaveQuestion = (e: React.FormEvent) => {
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

    if (editingId) {
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id === editingId) {
            return {
              ...q,
              question: questionText.trim(),
              options: cleanedOptions
            };
          }
          return applyToAllQuestions ? { ...q, options: cleanedOptions } : q;
        })
      );
      setAdminMessage(
        applyToAllQuestions
          ? 'Pergunta atualizada e alternativas A, B e C salvas para todas as perguntas!'
          : 'Pergunta atualizada com sucesso!'
      );
    } else {
      const newQuestion: Question = {
        id: `q-${Date.now()}`,
        question: questionText.trim(),
        options: cleanedOptions
      };
      setQuestions((prev) => {
        const updatedExisting = applyToAllQuestions
          ? prev.map((q) => ({ ...q, options: cleanedOptions }))
          : prev;
        return [...updatedExisting, newQuestion];
      });
      setAdminMessage(
        applyToAllQuestions
          ? 'Nova pergunta adicionada e alternativas A, B e C salvas para todas as perguntas!'
          : 'Nova pergunta cadastrada com sucesso!'
      );
    }

    resetAdminForm(cleanedOptions);
    setTimeout(() => setAdminMessage(null), 3000);
  };

  const handleApplyOptionsToAllNow = () => {
    if (options.some((opt) => !opt.trim())) {
      setAdminMessage('Preencha o texto das alternativas A, B e C antes de salvar para todas.');
      return;
    }
    const cleanedOptions: [string, string, string] = [
      options[0].trim(),
      options[1].trim(),
      options[2].trim()
    ];
    setSavedDefaultOptions(cleanedOptions);
    setQuestions((prev) => prev.map((q) => ({ ...q, options: cleanedOptions })));
    setAdminMessage('As alternativas A, B e C foram salvas e aplicadas em todas as perguntas!');
    setTimeout(() => setAdminMessage(null), 3000);
  };

  const handleEditQuestion = (q: Question) => {
    setEditingId(q.id);
    setQuestionText(q.question);
    setOptions([q.options[0] || '', q.options[1] || '', q.options[2] || '']);
    setAdminMessage(null);
  };

  const handleDeleteQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    if (editingId === id) {
      resetAdminForm();
    }
    setCurrentIndex(0);
    setIsQuizFinished(false);
  };

  const handleClearAllQuestions = () => {
    setQuestions([]);
    resetAdminForm();
    handleRestartQuiz();
  };

  const handleClearAllSubmissions = () => {
    setSubmissions([]);
  };

  const BAR_COLORS = ['bg-sky-600', 'bg-emerald-600', 'bg-amber-500'] as const;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-[960px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <span className="text-xl font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0">
            Quiz Escolar
          </span>

          <button
            type="button"
            onClick={handleRestartQuiz}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <Shield className="w-3.5 h-3.5 text-sky-600" />
                  <span>Administração Autorizada</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-900 font-display">
                  Painel do Administrador
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Admin Navigation Tabs */}
                <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setAdminTab('perguntas')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      adminTab === 'perguntas'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
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
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    Gráfico de Respostas
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAdminOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
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
                <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2">
                      {editingId ? (
                        <>
                          <Pencil className="w-4 h-4 text-sky-600" />
                          Editar Pergunta
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 text-sky-600" />
                          Nova Pergunta
                        </>
                      )}
                    </h2>

                    {editingId && (
                      <button
                        type="button"
                        onClick={() => resetAdminForm()}
                        className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancelar
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleSaveQuestion} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Enunciado da Pergunta
                      </label>
                      <textarea
                        rows={3}
                        value={questionText}
                        onChange={(e) => setQuestionText(e.target.value)}
                        placeholder="Digite a pergunta escolar aqui..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-sky-600"
                      />
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-700">
                          Alternativas A, B e C (Salvas automaticamente)
                        </label>
                      </div>
                      {OPTION_LETTERS.map((letter, idx) => (
                        <div key={letter} className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-600 w-5 shrink-0">
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
                            className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-sky-600"
                          />
                        </div>
                      ))}

                      <label className="flex items-center gap-2 pt-1 text-xs text-slate-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={applyToAllQuestions}
                          onChange={(e) => setApplyToAllQuestions(e.target.checked)}
                          className="w-4 h-4 accent-sky-600 rounded cursor-pointer"
                        />
                        <span>Manter estas mesmas alternativas A, B e C em todas as perguntas</span>
                      </label>
                    </div>

                    {adminMessage && (
                      <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs font-medium text-sky-800">
                        {adminMessage}
                      </div>
                    )}

                    <div className="space-y-2">
                      <button
                        type="submit"
                        className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        {editingId ? 'Salvar Alterações' : 'Adicionar Pergunta'}
                      </button>

                      {questions.length > 0 && (
                        <button
                          type="button"
                          onClick={handleApplyOptionsToAllNow}
                          className="w-full py-2 px-4 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                          Aplicar A, B e C atuais em todas as perguntas agora
                        </button>
                      )}
                    </div>
                  </form>
                </section>

                {/* Registered Questions List (7 cols) */}
                <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 font-display">
                        Perguntas Cadastradas ({questions.length})
                      </h2>
                      <p className="text-xs text-slate-500">
                        Gerencie, edite ou exclua as questões do Quiz Escolar
                      </p>
                    </div>

                    {questions.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllQuestions}
                        className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir Todas
                      </button>
                    )}
                  </div>

                  {questions.length === 0 ? (
                    <div className="py-12 text-center space-y-2">
                      <p className="text-sm font-semibold text-slate-700">
                        Nenhuma pergunta cadastrada.
                      </p>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">
                        Use o formulário ao lado para adicionar perguntas ao sistema.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {questions.map((q, idx) => (
                        <div key={q.id} className="py-4 first:pt-1 last:pb-1 space-y-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <span className="text-xs font-mono font-semibold text-sky-700">
                                Questão {String(idx + 1).padStart(2, '0')}
                              </span>
                              <p className="text-sm font-semibold text-slate-900">{q.question}</p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleEditQuestion(q)}
                                title="Editar pergunta"
                                className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteQuestion(q.id)}
                                title="Excluir pergunta"
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-xs">
                            {q.options.slice(0, 3).map((opt, oIdx) => (
                              <div
                                key={oIdx}
                                className="px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50/50 text-slate-700"
                              >
                                <span className="font-mono mr-1.5">{OPTION_LETTERS[oIdx]})</span>
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
            ) : (
              /* =========================================================== */
              /* ADMIN TAB 2: RESPONSE CHARTS PAGE                           */
              /* =========================================================== */
              <div className="space-y-6">
                {/* Summary & Global Distribution Card */}
                <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-sky-600" />
                        Gráfico Geral das Respostas Anônimas
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Total de questionários finalizados:{' '}
                        <strong className="font-mono text-slate-800 tabular-nums">
                          {chartData.totalSubmissions}
                        </strong>{' '}
                        · Total de respostas registradas:{' '}
                        <strong className="font-mono text-slate-800 tabular-nums">
                          {chartData.totalAnswersCount}
                        </strong>
                      </p>
                    </div>

                    {submissions.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllSubmissions}
                        className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Zerar Respostas do Gráfico
                      </button>
                    )}
                  </div>

                  {/* Global A, B, C Bar Chart */}
                  <div className="space-y-4">
                    <span className="block text-xs font-semibold text-slate-700">
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
                              <span className="font-semibold text-slate-800">{labelText}</span>
                              <span className="font-mono tabular-nums text-slate-600">
                                {count} {count === 1 ? 'voto' : 'votos'} ({pct}%)
                              </span>
                            </div>
                            <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden">
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

                {/* Breakdown Chart Per Question */}
                <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 font-display">
                      Gráfico Detalhado por Pergunta
                    </h3>
                    <p className="text-xs text-slate-500">
                      Quantidade e porcentagem de escolhas em cada questão cadastrada
                    </p>
                  </div>

                  {questions.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-500">
                      Nenhuma pergunta cadastrada para exibir gráficos.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {chartData.perQuestion.map((item, qIdx) => (
                        <div key={item.question.id} className="py-5 first:pt-1 last:pb-1 space-y-3.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="space-y-0.5">
                              <span className="text-xs font-mono font-semibold text-sky-700">
                                Questão {String(qIdx + 1).padStart(2, '0')}
                              </span>
                              <h4 className="text-sm font-semibold text-slate-900">
                                {item.question.question}
                              </h4>
                            </div>
                            <span className="text-xs font-mono tabular-nums text-slate-500">
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
                                    <span className="text-slate-700">
                                      <strong className="font-mono mr-1.5">{letter})</strong>
                                      {optLabel}
                                    </span>
                                    <span className="font-mono tabular-nums text-slate-600">
                                      {count} ({pct}%)
                                    </span>
                                  </div>
                                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
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
            )}
          </div>
        ) : !hasStartedQuiz ? (
          /* =============================================================== */
          /* PRE-QUIZ ANONYMOUS NOTICE SCREEN                                */
          /* =============================================================== */
          <section className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center space-y-6">
            <div className="space-y-3 max-w-lg mx-auto">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display balance-text">
                Esse questionário é totalmente anônimo
              </h1>
              <p className="text-sm text-slate-500">
                Suas respostas são confidenciais e nenhuma informação pessoal é identificada.
              </p>
            </div>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setHasStartedQuiz(true)}
                className="px-6 py-3 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
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
            className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6"
          >
            {/* Progress Header */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500 font-mono tabular-nums">
                <span className="font-semibold text-slate-800">
                  Questão {String(currentIndex + 1).padStart(2, '0')} de{' '}
                  {String(questions.length).padStart(2, '0')}
                </span>
                <span>Esse questionário é totalmente anônimo</span>
              </div>

              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-600 transition-transform duration-200 origin-left"
                  style={{
                    transform: `scaleX(${(currentIndex + 1) / questions.length})`
                  }}
                />
              </div>
            </div>

            {/* Question Title */}
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug font-display">
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
                        ? 'border-sky-600 bg-sky-50/70 text-slate-900 ring-1 ring-sky-600 font-semibold'
                        : 'border-slate-200 bg-white hover:border-sky-600 hover:bg-slate-50 text-slate-900'
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-lg font-mono text-sm font-semibold flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {OPTION_LETTERS[idx]}
                    </span>
                    <span className="text-base leading-relaxed">{optionText}</span>
                  </button>
                );
              })}
            </div>

            {/* Action Controls */}
            <div className="pt-2 flex items-center justify-end gap-4 border-t border-slate-100">
              <button
                type="button"
                disabled={currentSelectedOption === null}
                onClick={handleNextQuestion}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                {currentIndex + 1 < questions.length
                  ? 'Próxima Pergunta'
                  : 'Finalizar Quiz'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        ) : !isQuizFinished && !currentQuestion ? (
          /* Empty State when there are 0 questions in the system */
          <section className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center space-y-3">
            <div className="text-xs font-mono text-slate-400">QUESTÃO 00 DE 00</div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 font-display">
              Nenhuma pergunta disponível no momento
            </h1>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Não há questões cadastradas no sistema neste momento.
            </p>
          </section>
        ) : (
          /* Final Completion Screen */
          <section className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <Award className="w-4 h-4 text-sky-600" />
                <span>Concluído</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Quiz Concluído!
              </h1>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Suas respostas anônimas foram registradas com sucesso.
              </p>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleRestartQuiz}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
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
