import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';

interface Question {
  id: string;
  question: string;
  options: [string, string, string];
}

interface QuizSubmission {
  id: string;
  submittedAt: string;
  answers: Record<string, number>;
}

interface StoreData {
  questions: Question[];
  savedDefaultOptions: [string, string, string];
  submissions: QuizSubmission[];
}

const DATA_FILE = path.resolve(process.cwd(), 'quiz-store.json');

function loadStore(): StoreData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        savedDefaultOptions:
          Array.isArray(parsed.savedDefaultOptions) && parsed.savedDefaultOptions.length >= 3
            ? [
                String(parsed.savedDefaultOptions[0] || ''),
                String(parsed.savedDefaultOptions[1] || ''),
                String(parsed.savedDefaultOptions[2] || '')
              ]
            : ['', '', ''],
        submissions: Array.isArray(parsed.submissions) ? parsed.submissions : []
      };
    }
  } catch (err) {
    console.error('Error reading store:', err);
  }
  return {
    questions: [],
    savedDefaultOptions: ['', '', ''],
    submissions: []
  };
}

function saveStore(data: StoreData): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing store:', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // Get shared quiz state for all users
  app.get('/api/quiz', (_req, res) => {
    const store = loadStore();
    res.json(store);
  });

  // Update questions and default options (from Admin Panel)
  app.put('/api/quiz/questions', (req, res) => {
    const store = loadStore();
    const { questions, savedDefaultOptions } = req.body;

    if (Array.isArray(questions)) {
      store.questions = questions.map((q: Question) => ({
        id: String(q.id || `q-${Date.now()}`),
        question: String(q.question || ''),
        options: Array.isArray(q.options)
          ? [
              String(q.options[0] || ''),
              String(q.options[1] || ''),
              String(q.options[2] || '')
            ]
          : ['', '', '']
      }));
    }

    if (Array.isArray(savedDefaultOptions) && savedDefaultOptions.length >= 3) {
      store.savedDefaultOptions = [
        String(savedDefaultOptions[0] || ''),
        String(savedDefaultOptions[1] || ''),
        String(savedDefaultOptions[2] || '')
      ];
    }

    saveStore(store);
    res.json(store);
  });

  // Record a new anonymous quiz submission from any user
  app.post('/api/quiz/submissions', (req, res) => {
    const store = loadStore();
    const { answers } = req.body;

    if (answers && typeof answers === 'object') {
      const newSub: QuizSubmission = {
        id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        submittedAt: new Date().toISOString(),
        answers
      };
      store.submissions.push(newSub);
      saveStore(store);
    }

    res.json(store);
  });

  // Clear all anonymous submissions (from Admin Chart page)
  app.delete('/api/quiz/submissions', (_req, res) => {
    const store = loadStore();
    store.submissions = [];
    saveStore(store);
    res.json(store);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
