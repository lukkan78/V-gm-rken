// Quiz engine - manages quiz flow and logic

import { state, resetQuizState, updateStreak, saveSettings } from '../state.js';
import { generateQuestion, filterByDifficulty, shuffleArray } from './question-types.js';
import { updateWithSM2, isDueForReview, getRetentionScore } from '../learning/sm2.js';
import {
  getAll,
  getDueForReview,
  getWeakestSigns,
  saveQuizSession,
  updateCategoryStats,
  STORES
} from '../utils/storage.js';

const IMAGE_BASE = 'https://www.transportstyrelsen.se/link/';

let currentQuestion = null;
let allSignsFlat = [];

// Initialize quiz engine with sign data
export function initQuizEngine(signData) {
  state.signData = signData;
  allSignsFlat = [];

  Object.entries(signData).forEach(([key, category]) => {
    category.signs.forEach(sign => {
      allSignsFlat.push({
        ...sign,
        category: key,
        categoryName: category.name,
        categoryCode: category.code,
        categoryColor: category.color
      });
    });
  });
}

// Get all signs as flat array
export function getAllSigns() {
  return allSignsFlat;
}

// Get image URL for a sign
export function getImageUrl(imgHash) {
  return `${IMAGE_BASE}${imgHash}.aspx`;
}

// Select signs for quiz based on mode
export async function selectQuizSigns() {
  const { quizMode, questionsPerQuiz, selectedCategories, difficulty } = state;

  let candidates = [];

  // Filter by selected categories
  selectedCategories.forEach(catKey => {
    const category = state.signData[catKey];
    if (category) {
      category.signs.forEach(sign => {
        candidates.push({
          ...sign,
          category: catKey,
          categoryName: category.name,
          categoryCode: category.code,
          categoryColor: category.color
        });
      });
    }
  });

  // Apply difficulty filter
  candidates = filterByDifficulty(candidates, difficulty);

  let selected = [];

  switch (quizMode) {
    case 'missed': {
      // Practice previously missed signs
      const lastSession = await getLatestQuizSession();
      if (lastSession && lastSession.wrongAnswers?.length > 0) {
        const missedIds = new Set(lastSession.wrongAnswers.map(s => s.id));
        selected = candidates.filter(s => missedIds.has(s.id));
      }
      if (selected.length < 5) {
        // Not enough missed signs, add random ones
        const remaining = candidates.filter(s => !selected.some(sel => sel.id === s.id));
        selected = [...selected, ...shuffleArray(remaining).slice(0, questionsPerQuiz - selected.length)];
      }
      break;
    }

    case 'weakest': {
      // Practice weakest signs based on accuracy
      const weakest = await getWeakestSigns(questionsPerQuiz);
      const weakestIds = new Set(weakest.map(w => w.signId));
      selected = candidates.filter(s => weakestIds.has(s.id));

      if (selected.length < questionsPerQuiz) {
        const remaining = candidates.filter(s => !selected.some(sel => sel.id === s.id));
        selected = [...selected, ...shuffleArray(remaining).slice(0, questionsPerQuiz - selected.length)];
      }
      break;
    }

    case 'spaced': {
      // Spaced repetition - due for review
      const dueForReview = await getDueForReview(questionsPerQuiz * 2);
      const dueIds = new Set(dueForReview.map(d => d.signId));
      selected = candidates.filter(s => dueIds.has(s.id));

      if (selected.length < questionsPerQuiz) {
        // Add new signs that haven't been studied
        const allProgress = await getAll(STORES.SIGN_PROGRESS);
        const studiedIds = new Set(allProgress.map(p => p.signId));
        const newSigns = candidates.filter(s => !studiedIds.has(s.id));
        const remaining = shuffleArray(newSigns).slice(0, questionsPerQuiz - selected.length);
        selected = [...selected, ...remaining];
      }
      break;
    }

    case 'adaptive': {
      // Adaptive learning - mix of new and review
      const allProgress = await getAll(STORES.SIGN_PROGRESS);
      const progressMap = new Map(allProgress.map(p => [p.signId, p]));

      // Sort candidates by learning priority
      const scored = candidates.map(sign => {
        const progress = progressMap.get(sign.id);
        let priority = 50; // Base priority for new signs

        if (progress) {
          const retention = getRetentionScore(progress);
          const isDue = isDueForReview(progress);

          if (isDue) {
            priority = 100 - retention; // Due signs get high priority
          } else {
            priority = 20 - retention * 0.2; // Known signs get low priority
          }
        }

        return { sign, priority };
      });

      scored.sort((a, b) => b.priority - a.priority);
      selected = scored.slice(0, questionsPerQuiz).map(s => s.sign);
      break;
    }

    default: {
      // Standard mode - random selection
      selected = shuffleArray(candidates).slice(0, questionsPerQuiz);
    }
  }

  state.quizSigns = selected;
  return selected;
}

async function getLatestQuizSession() {
  const sessions = await getAll(STORES.QUIZ_SESSIONS);
  if (sessions.length === 0) return null;
  return sessions.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

// Start a new quiz
export async function startQuiz() {
  if (state.selectedCategories.length === 0) return false;

  resetQuizState();
  await selectQuizSigns();

  if (state.quizSigns.length === 0) {
    return false;
  }

  return true;
}

// Load current question
export function loadCurrentQuestion() {
  const sign = state.quizSigns[state.currentQuestion];
  if (!sign) return null;

  currentQuestion = generateQuestion(sign, allSignsFlat);
  return currentQuestion;
}

// Get current question
export function getCurrentQuestion() {
  return currentQuestion;
}

// Check answer and update progress
export async function checkAnswer(selectedOptionId) {
  if (!currentQuestion) return null;

  const responseTime = Date.now() - currentQuestion.startTime;
  const correctOption = currentQuestion.options.find(opt => opt.isCorrect);
  const isCorrect = selectedOptionId === correctOption.id;

  // Update state
  if (isCorrect) {
    state.correctAnswers++;
  } else {
    state.wrongAnswers.push(currentQuestion.sign);
  }
  updateStreak(isCorrect);

  // Update learning progress with SM-2
  await updateWithSM2(
    currentQuestion.sign.id,
    currentQuestion.sign.category,
    isCorrect,
    responseTime
  );

  return {
    isCorrect,
    correctAnswer: correctOption,
    responseTime,
    streak: state.streak
  };
}

// Move to next question
export function nextQuestion() {
  state.currentQuestion++;
  return state.currentQuestion < state.quizSigns.length;
}

// Check if quiz is complete
export function isQuizComplete() {
  return state.currentQuestion >= state.quizSigns.length;
}

// Get quiz progress
export function getQuizProgress() {
  return {
    current: state.currentQuestion + 1,
    total: state.quizSigns.length,
    percentage: ((state.currentQuestion + 1) / state.quizSigns.length) * 100,
    correct: state.correctAnswers,
    streak: state.streak
  };
}

// Finish quiz and save results
export async function finishQuiz() {
  state.quizEndTime = Date.now();

  const duration = state.quizEndTime - state.quizStartTime;
  const percentage = Math.round((state.correctAnswers / state.quizSigns.length) * 100);

  // Save quiz session
  await saveQuizSession({
    categories: state.selectedCategories,
    mode: state.quizMode,
    difficulty: state.difficulty,
    questionType: state.questionType,
    totalQuestions: state.quizSigns.length,
    correctAnswers: state.correctAnswers,
    wrongAnswers: state.wrongAnswers.map(s => ({ id: s.id, name: s.name })),
    percentage,
    duration,
    bestStreak: Math.max(state.streak, state.bestStreak)
  });

  // Update category stats
  const categoryCorrect = {};
  const categoryTotal = {};

  state.quizSigns.forEach((sign, index) => {
    const cat = sign.category;
    categoryTotal[cat] = (categoryTotal[cat] || 0) + 1;
  });

  state.wrongAnswers.forEach(sign => {
    const cat = sign.category;
    categoryCorrect[cat] = (categoryCorrect[cat] || 0);
  });

  for (const cat of Object.keys(categoryTotal)) {
    const wrong = state.wrongAnswers.filter(s => s.category === cat).length;
    const correct = categoryTotal[cat] - wrong;
    await updateCategoryStats(cat, correct, categoryTotal[cat]);
  }

  return {
    totalQuestions: state.quizSigns.length,
    correctAnswers: state.correctAnswers,
    wrongAnswers: state.wrongAnswers,
    percentage,
    duration,
    streak: state.bestStreak
  };
}

// Get quiz results
export function getQuizResults() {
  const percentage = Math.round((state.correctAnswers / state.quizSigns.length) * 100);

  return {
    totalQuestions: state.quizSigns.length,
    correctAnswers: state.correctAnswers,
    incorrectAnswers: state.quizSigns.length - state.correctAnswers,
    wrongAnswers: state.wrongAnswers,
    percentage,
    streak: state.streak,
    bestStreak: state.bestStreak
  };
}
