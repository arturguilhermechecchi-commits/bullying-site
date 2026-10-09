/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  ArrowRight,
  Award
} from 'lucide-react';
import { INITIAL_QUESTIONS, Question } from './data/questions';

interface AnswerRecord {
  questionId: string;
  selectedOption: number;
  isCorrect: boolean;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

export default function App() {
  const [questions] = useState<Question[]>(INITIAL_QUESTIONS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [answers, setAnswers] = useState<Record<string, AnswerRecord>>({});
  const [isQuizFinished, setIsQuizFinished] = useState<boolean>(false);

  const currentQuestion = questions[currentIndex];

  const stats = useMemo(() => {
    const records = questions
      .map((q) => answers[q.id])
      .filter((r): r is AnswerRecord => Boolean(r));
    const correctCount = records.filter((r) => r.isCorrect).length;
    const wrongCount = records.filter((r) => !r.isCorrect).length;
    const answeredCount = records.length;
    const totalCount = questions.length;
    const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
    const finalPercentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    const points = correctCount * 10;
    const maxPoints = totalCount * 10;

    return {
      correctCount,
      wrongCount,
      answeredCount,
      totalCount,
      accuracy,
      finalPercentage,
      points,
      maxPoints
    };
  }, [questions, answers]);

  const handleRestartQuiz = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsConfirmed(false);
    setIsQuizFinished(false);
    setAnswers({});
  };

  const handleOptionClick = (idx: number) => {
    if (isConfirmed) return;
    setSelectedOption(idx);
  };

  const handleConfirmAnswer = () => {
    if (selectedOption === null || isConfirmed || !currentQuestion) return;
    const isCorrect = selectedOption === currentQuestion.correctIndex;
    setIsConfirmed(true);
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        questionId: currentQuestion.id,
        selectedOption,
        isCorrect
      }
    }));
  };

  const handleNextQuestion = () => {
    if (currentIndex + 1 < questions.length) {
      const nextIdx = currentIndex + 1;
      const nextQ = questions[nextIdx];
      const existingAnswer = nextQ ? answers[nextQ.id] : undefined;
      setCurrentIndex(nextIdx);
      setSelectedOption(existingAnswer ? existingAnswer.selectedOption : null);
      setIsConfirmed(Boolean(existingAnswer));
    } else {
      setIsQuizFinished(true);
    }
  };

  const handleJumpToQuestion = (idx: number) => {
    const targetQ = questions[idx];
    if (!targetQ) return;
    const existingAnswer = answers[targetQ.id];
    setIsQuizFinished(false);
    setCurrentIndex(idx);
    setSelectedOption(existingAnswer ? existingAnswer.selectedOption : null);
    setIsConfirmed(Boolean(existingAnswer));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1140px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <span className="text-xl font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0">
            Quiz Escolar
          </span>

          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 font-mono tabular-nums">
            <span>Pontuação: {stats.points} pts</span>
            <span aria-hidden="true">·</span>
            <span>Acertos: {stats.correctCount}</span>
            <span aria-hidden="true">·</span>
            <span>Erros: {stats.wrongCount}</span>
          </div>

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

      {/* Single Screen Main Content */}
      <main className="flex-1 max-w-[1140px] w-full mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Zone: Question & Correction Area (8 cols) */}
          <div className="lg:col-span-8">
            {!isQuizFinished && currentQuestion ? (
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
                    <span>Valendo 10 pontos</span>
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

                {/* Multiple Choice Options */}
                <div className="space-y-3" role="radiogroup" aria-label="Alternativas da questão">
                  {currentQuestion.options.map((optionText, idx) => {
                    const isSelected = selectedOption === idx;
                    const isRightOption = idx === currentQuestion.correctIndex;

                    let buttonStyle =
                      'border-slate-200 bg-white hover:border-sky-600 hover:bg-slate-50 text-slate-900';
                    let badgeStyle = 'bg-slate-100 text-slate-700';
                    let statusLabel: React.ReactNode = null;

                    if (!isConfirmed && isSelected) {
                      buttonStyle = 'border-sky-600 bg-sky-50/70 text-slate-900 ring-1 ring-sky-600';
                      badgeStyle = 'bg-sky-600 text-white';
                    } else if (isConfirmed) {
                      if (isRightOption) {
                        buttonStyle =
                          'border-emerald-600 bg-emerald-50/80 text-emerald-950 font-semibold';
                        badgeStyle = 'bg-emerald-600 text-white';
                        statusLabel = (
                          <span className="ml-auto flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-700 whitespace-nowrap shrink-0">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            CORRETA
                          </span>
                        );
                      } else if (isSelected && !isRightOption) {
                        buttonStyle = 'border-red-600 bg-red-50/80 text-red-950';
                        badgeStyle = 'bg-red-600 text-white';
                        statusLabel = (
                          <span className="ml-auto flex items-center gap-1.5 text-xs font-mono font-semibold text-red-700 whitespace-nowrap shrink-0">
                            <XCircle className="w-4 h-4 shrink-0" />
                            SUA ESCOLHA
                          </span>
                        );
                      } else {
                        buttonStyle = 'border-slate-200 bg-slate-50/50 text-slate-400 opacity-75';
                        badgeStyle = 'bg-slate-100 text-slate-400';
                      }
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={isConfirmed}
                        onClick={() => handleOptionClick(idx)}
                        className={`w-full text-left p-4 rounded-xl border transition-colors flex items-center gap-4 cursor-pointer disabled:cursor-default ${buttonStyle}`}
                      >
                        <span
                          className={`w-8 h-8 rounded-lg font-mono text-sm font-semibold flex items-center justify-center shrink-0 transition-colors ${badgeStyle}`}
                        >
                          {OPTION_LETTERS[idx]}
                        </span>
                        <span className="text-base leading-relaxed">{optionText}</span>
                        {statusLabel}
                      </button>
                    );
                  })}
                </div>

                {/* Automatic Correction Callout */}
                {isConfirmed && (
                  <div
                    className={`p-5 rounded-xl border ${
                      selectedOption === currentQuestion.correctIndex
                        ? 'bg-emerald-50/60 border-emerald-200 text-slate-800'
                        : 'bg-red-50/60 border-red-200 text-slate-800'
                    } space-y-2`}
                  >
                    <div className="flex items-center gap-2 text-xs font-mono font-semibold tracking-wide">
                      {selectedOption === currentQuestion.correctIndex ? (
                        <span className="text-emerald-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />● RESPOSTA CORRETA (+10 PONTOS)
                        </span>
                      ) : (
                        <span className="text-red-700 flex items-center gap-1.5">
                          <XCircle className="w-4 h-4" />▲ RESPOSTA INCORRETA · Alternativa correta:{' '}
                          {OPTION_LETTERS[currentQuestion.correctIndex]}
                        </span>
                      )}
                    </div>
                    {currentQuestion.explanation && (
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {currentQuestion.explanation}
                      </p>
                    )}
                  </div>
                )}

                {/* Action Controls */}
                <div className="pt-2 flex items-center justify-end gap-4 border-t border-slate-100">
                  {!isConfirmed ? (
                    <button
                      type="button"
                      disabled={selectedOption === null}
                      onClick={handleConfirmAnswer}
                      className="px-6 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Confirmar Resposta
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleNextQuestion}
                      className="px-6 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {currentIndex + 1 < questions.length
                        ? 'Próxima Pergunta'
                        : 'Ver Resultado Final'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
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
                  Todas as perguntas foram retiradas do sistema. Quando novas questões forem
                  adicionadas, elas aparecerão automaticamente nesta tela com correção imediata e
                  pontuação.
                </p>
              </section>
            ) : (
              /* Final Result Screen */
              <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Award className="w-4 h-4 text-sky-600" />
                      <span>Resultado Final</span>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 font-display">
                      {stats.finalPercentage >= 80
                        ? 'Excelente Desempenho!'
                        : stats.finalPercentage >= 50
                        ? 'Bom Trabalho!'
                        : 'Quiz Concluído!'}
                    </h1>
                  </div>

                  <button
                    type="button"
                    onClick={handleRestartQuiz}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Tentar Novamente
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <span className="text-xs text-slate-500 block mb-1">Pontuação Final</span>
                    <strong className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                      {stats.points} / {stats.maxPoints} pts
                    </strong>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <span className="text-xs text-slate-500 block mb-1">Acertos</span>
                    <strong className="text-2xl font-bold font-mono tabular-nums text-emerald-600">
                      {stats.correctCount} de {stats.totalCount}
                    </strong>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <span className="text-xs text-slate-500 block mb-1">Aproveitamento</span>
                    <strong className="text-2xl font-bold font-mono tabular-nums text-sky-600">
                      {stats.finalPercentage}%
                    </strong>
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Right Zone: Scoreboard & Progress Panel (4 cols) */}
          <aside className="lg:col-span-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 font-display">
                  Placar e Pontuação
                </h2>
                <span className="text-xs font-mono font-semibold text-sky-700 tabular-nums">
                  {stats.points} / {stats.maxPoints} pts
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-center">
                  <span className="block text-xs text-slate-500">Acertos</span>
                  <strong className="text-xl font-bold font-mono tabular-nums text-emerald-600">
                    {stats.correctCount}
                  </strong>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-center">
                  <span className="block text-xs text-slate-500">Erros</span>
                  <strong className="text-xl font-bold font-mono tabular-nums text-red-600">
                    {stats.wrongCount}
                  </strong>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-center">
                  <span className="block text-xs text-slate-500">Resultado</span>
                  <strong className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {stats.accuracy}%
                  </strong>
                </div>
              </div>

              {questions.length > 0 && (
                <div className="space-y-2.5 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Progresso</span>
                    <span className="font-mono tabular-nums">
                      {stats.answeredCount}/{stats.totalCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {questions.map((q, idx) => {
                      const record = answers[q.id];
                      const isCurrent = idx === currentIndex;
                      let cellClass =
                        'border-slate-200 bg-white text-slate-700 hover:border-slate-400';

                      if (record) {
                        cellClass = record.isCorrect
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-semibold'
                          : 'border-red-600 bg-red-50 text-red-800 font-semibold';
                      }
                      if (isCurrent) {
                        cellClass += ' ring-2 ring-sky-600 ring-offset-1';
                      }

                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => handleJumpToQuestion(idx)}
                          className={`h-9 rounded-lg border font-mono text-xs tabular-nums flex items-center justify-center transition-colors cursor-pointer ${cellClass}`}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
