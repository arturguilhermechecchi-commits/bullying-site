/**
 * Utilitário de revisão e correção ortográfica e gramatical em língua portuguesa (pt-BR).
 * Corrige acentuação, erros de digitação comuns, espaçamento, pontuação e inicial maiúscula.
 */

const WORD_REPLACEMENTS: Record<string, string> = {
  // Pronomes, advérbios e conectivos
  voce: 'você',
  voces: 'vocês',
  nao: 'não',
  tambem: 'também',
  alguem: 'alguém',
  ninguem: 'ninguém',
  porem: 'porém',
  alem: 'além',
  entao: 'então',
  apos: 'após',
  ate: 'até',
  ja: 'já',
  so: 'só',
  tres: 'três',
  parabens: 'parabéns',
  atras: 'atrás',
  atraves: 'através',
  alias: 'aliás',

  // Formas verbais inequívocas
  sao: 'são',
  estao: 'estão',
  irao: 'irão',
  serao: 'serão',
  terao: 'terão',
  farao: 'farão',
  darao: 'darão',
  poderao: 'poderão',
  deverao: 'deverão',
  comecar: 'começar',
  comecou: 'começou',

  // Substantivos e termos escolares
  questao: 'questão',
  questoes: 'questões',
  perguntaa: 'pergunta',
  opcao: 'opção',
  opcoes: 'opções',
  educacao: 'educação',
  avaliacao: 'avaliação',
  avaliacoes: 'avaliações',
  informacao: 'informação',
  informacoes: 'informações',
  participacao: 'participação',
  alimentacao: 'alimentação',
  comunicacao: 'comunicação',
  organizacao: 'organização',
  situacao: 'situação',
  situacoes: 'situações',
  solucao: 'solução',
  solucoes: 'soluções',
  atencao: 'atenção',
  direcao: 'direção',
  coordenacao: 'coordenação',
  reuniao: 'reunião',
  reunioes: 'reuniões',
  opiniao: 'opinião',
  opinioes: 'opiniões',
  licao: 'lição',
  licoes: 'lições',
  refeicao: 'refeição',
  refeicoes: 'refeições',
  manutencao: 'manutenção',
  seguranca: 'segurança',
  mudanca: 'mudança',
  mudancas: 'mudanças',
  crianca: 'criança',
  criancas: 'crianças',
  esperanca: 'esperança',
  confianca: 'confiança',
  presenca: 'presença',
  diferenca: 'diferença',
  diferencas: 'diferenças',
  doenca: 'doença',
  doencas: 'doenças',
  espaco: 'espaço',
  espacos: 'espaços',
  servico: 'serviço',
  servicos: 'serviços',
  preco: 'preço',
  precos: 'preços',
  endereco: 'endereço',
  enderecos: 'endereços',
  numero: 'número',
  numeros: 'números',
  grafico: 'gráfico',
  graficos: 'gráficos',

  // Disciplinas e ambiente escolar
  matematica: 'matemática',
  portugues: 'português',
  ingles: 'inglês',
  frances: 'francês',
  ciencias: 'ciências',
  fisica: 'física',
  quimica: 'química',
  informatica: 'informática',
  robotica: 'robótica',
  artistica: 'artística',
  medio: 'médio',
  tecnico: 'técnico',
  academico: 'acadêmico',
  pedagogico: 'pedagógico',
  didatico: 'didático',
  horario: 'horário',
  horarios: 'horários',
  calendario: 'calendário',
  questionario: 'questionário',
  questionarios: 'questionários',
  formulario: 'formulário',
  formularios: 'formulários',
  laboratorio: 'laboratório',
  laboratorios: 'laboratórios',
  auditorio: 'auditório',
  refeitorio: 'refeitório',
  ginasio: 'ginásio',
  patio: 'pátio',
  serie: 'série',
  series: 'séries',
  periodo: 'período',
  periodos: 'períodos',
  materia: 'matéria',
  materias: 'matérias',
  conteudo: 'conteúdo',
  conteudos: 'conteúdos',
  exercicio: 'exercício',
  exercicios: 'exercícios',
  nivel: 'nível',
  niveis: 'níveis',
  frequencia: 'frequência',
  experiencia: 'experiência',
  convivencia: 'convivência',
  ausencia: 'ausência',
  importancia: 'importância',
  distancia: 'distância',
  tolerancia: 'tolerância',
  violencia: 'violência',

  // Adjetivos e qualificadores comuns em alternativas
  dificil: 'difícil',
  dificeis: 'difíceis',
  facil: 'fácil',
  faceis: 'fáceis',
  util: 'útil',
  uteis: 'úteis',
  possivel: 'possível',
  possiveis: 'possíveis',
  impossivel: 'impossível',
  disponivel: 'disponível',
  disponiveis: 'disponíveis',
  responsavel: 'responsável',
  responsaveis: 'responsáveis',
  agradavel: 'agradável',
  confortavel: 'confortável',
  saudavel: 'saudável',
  razoavel: 'razoável',
  otimo: 'ótimo',
  otima: 'ótima',
  otimos: 'ótimos',
  otimas: 'ótimas',
  pessimo: 'péssimo',
  pessima: 'péssima',
  pessimos: 'péssimos',
  pessimas: 'péssimas',
  necessario: 'necessário',
  necessaria: 'necessária',
  necessarios: 'necessários',
  necessarias: 'necessárias',
  obrigatorio: 'obrigatório',
  obrigatoria: 'obrigatória',
  anonimo: 'anônimo',
  anonima: 'anônima',
  anonimos: 'anônimos',
  anonimas: 'anônimas',
  automatico: 'automático',
  automatica: 'automática',
  altoaticamente: 'automaticamente',
  unico: 'único',
  unica: 'única',
  publico: 'público',
  publica: 'pública',
  proximo: 'próximo',
  proxima: 'próxima',
  proximos: 'próximos',
  proximas: 'próximas',
  ultimo: 'último',
  ultima: 'última',
  ultimos: 'últimos',
  ultimas: 'últimas',
  proprio: 'próprio',
  propria: 'própria'
};

const EXPRESSION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bqual\s+quer\b/gi, 'qualquer'],
  [/\bconcerteza\b/gi, 'com certeza'],
  [/\bapartir\b/gi, 'a partir'],
  [/\bderepente\b/gi, 'de repente'],
  [/\bporisso\b/gi, 'por isso'],
  [/\bas\s+vezes\b/gi, 'às vezes'],
  [/\ba\s+vezes\b/gi, 'às vezes'],
  [/\boque\b/gi, 'o que'],
  [/\bporque(?=\s*\?)/gi, 'por quê']
];

function matchCase(original: string, replacement: string): string {
  if (!original) return replacement;
  if (original === original.toUpperCase() && original.length > 1) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Corrige a ortografia, acentuação, pontuação e capitalização de um texto em português.
 */
export function correctPortugueseText(raw: string, isQuestion = false): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return '';

  // 1. Expressões compostas comuns
  for (const [pattern, replacement] of EXPRESSION_REPLACEMENTS) {
    text = text.replace(pattern, (matched) => matchCase(matched, replacement));
  }

  // 2. Correção palavra por palavra preservando maiúsculas/minúsculas
  text = text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ]+)/g, (word) => {
    const lower = word.toLowerCase();
    const corrected = WORD_REPLACEMENTS[lower];
    if (corrected) {
      return matchCase(word, corrected);
    }
    return word;
  });

  // 3. Ajuste de "Por que" no início de frases interrogativas
  if (isQuestion) {
    text = text.replace(/^porque\s+/i, (matched) => matchCase(matched.trim(), 'por que') + ' ');
  }

  // 4. Normalização de espaços antes e depois de sinais de pontuação
  text = text
    .replace(/\s+([,.;:?!])/g, '$1')
    .replace(/([,;:?!])([^\s0-9?!.,;:])/g, '$1 $2');

  // 5. Primeira letra sempre maiúscula
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // 6. Se for pergunta iniciada por pronome/advérbio interrogativo e sem pontuação final, adiciona "?"
  if (
    isQuestion &&
    !/[.?!:]$/.test(text) &&
    /^(Qual|Quais|Como|Onde|Quando|Por que|Quem|Quanto|Quantos|Quantas|O que|De que|Em que|Para você|Você\s)/i.test(
      text
    )
  ) {
    text = `${text}?`;
  }

  return text;
}
