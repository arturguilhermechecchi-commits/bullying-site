export interface Question {
  id: string;
  question: string;
  options: [string, string, string];
}

export const INITIAL_QUESTIONS: Question[] = [];
