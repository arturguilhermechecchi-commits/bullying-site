export interface Question {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation?: string;
}

export const INITIAL_QUESTIONS: Question[] = [];
