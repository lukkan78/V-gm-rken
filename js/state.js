// Centralized application state management

const STORAGE_KEY = 'vagmarkesforhor-settings';

export const state = {
  signData: {},
  selectedCategories: [],
  quizSigns: [],
  currentQuestion: 0,
  correctAnswers: 0,
  streak: 0,
  bestStreak: 0,
  wrongAnswers: [],
  questionsPerQuiz: 15,
  shuffleOptions: true,
  showCategoryInfo: true,
  questionType: 'mixed', // 'image-to-text', 'text-to-image', 'mixed'
  quizMode: 'standard', // 'standard', 'missed', 'weakest', 'spaced'
  difficulty: 'adaptive', // 'easy', 'medium', 'hard', 'adaptive'
  currentScreen: 'start',
  quizStartTime: null,
  quizEndTime: null
};

export function saveSettings() {
  const payload = {
    questionsPerQuiz: state.questionsPerQuiz,
    shuffleOptions: state.shuffleOptions,
    showCategoryInfo: state.showCategoryInfo,
    questionType: state.questionType,
    quizMode: state.quizMode,
    difficulty: state.difficulty,
    bestStreak: state.bestStreak
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadSettings() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    state.questionsPerQuiz = Number(parsed.questionsPerQuiz) || state.questionsPerQuiz;
    state.shuffleOptions = parsed.shuffleOptions !== false;
    state.showCategoryInfo = parsed.showCategoryInfo !== false;
    state.questionType = parsed.questionType || state.questionType;
    state.quizMode = parsed.quizMode || state.quizMode;
    state.difficulty = parsed.difficulty || state.difficulty;
    state.bestStreak = Number(parsed.bestStreak) || 0;
  } catch {
    // Ignore parse errors
  }
}

export function resetQuizState() {
  state.quizSigns = [];
  state.currentQuestion = 0;
  state.correctAnswers = 0;
  state.streak = 0;
  state.wrongAnswers = [];
  state.quizStartTime = Date.now();
  state.quizEndTime = null;
}

export function updateStreak(isCorrect) {
  if (isCorrect) {
    state.streak++;
    if (state.streak > state.bestStreak) {
      state.bestStreak = state.streak;
      saveSettings();
    }
  } else {
    state.streak = 0;
  }
}
