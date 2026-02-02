// Main application entry point

import { state, loadSettings, saveSettings } from './state.js';
import { initDB } from './utils/storage.js';
import {
  initQuizEngine,
  startQuiz,
  loadCurrentQuestion,
  checkAnswer,
  nextQuestion,
  isQuizComplete,
  getQuizProgress,
  finishQuiz,
  getQuizResults,
  getImageUrl,
  getAllSigns
} from './quiz/quiz-engine.js';
import { QuestionType } from './quiz/question-types.js';
import { initPredictionModel } from './ml/prediction.js';
import { renderDashboard, createMiniStats } from './ui/dashboard.js';
import {
  showStatus,
  hideStatus,
  createCategoryCard,
  createTextOption,
  createImageOption,
  createFeedback,
  createMissedCard,
  createQuizModeSelector,
  createQuestionTypeSelector,
  createDifficultySelector,
  showToast
} from './ui/components.js';

const DATA_URL = 'data/signs.json';

// DOM Elements
let installButton;
let statusBanner;

async function loadSignData() {
  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('Kunde inte läsa datafilen');

    const data = await response.json();
    initQuizEngine(data);
    hideStatus();
    return data;
  } catch (error) {
    showStatus('Misslyckades att ladda vägmärken. Kontrollera datafilen eller din anslutning.', true);
    return {};
  }
}

function renderCategories() {
  const grid = document.getElementById('category-grid');
  if (!grid) return;

  grid.innerHTML = '';

  Object.entries(state.signData).forEach(([key, category]) => {
    const card = document.createElement('div');
    card.innerHTML = createCategoryCard(key, category, state.selectedCategories.includes(key));
    const cardElement = card.firstElementChild;
    cardElement.addEventListener('click', () => toggleCategory(key, cardElement));
    grid.appendChild(cardElement);
  });
}

function toggleCategory(key, card) {
  const idx = state.selectedCategories.indexOf(key);
  if (idx > -1) {
    state.selectedCategories.splice(idx, 1);
    card.classList.remove('selected');
  } else {
    state.selectedCategories.push(key);
    card.classList.add('selected');
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = state.selectedCategories.length;
  const label = count === 0 ? '0 kategorier valda'
    : count === 1 ? '1 kategori vald'
    : `${count} kategorier valda`;

  const countEl = document.getElementById('selected-count');
  const startBtn = document.getElementById('start-btn');

  if (countEl) countEl.textContent = label;
  if (startBtn) startBtn.disabled = count === 0;
}

function selectAllCategories() {
  state.selectedCategories = Object.keys(state.signData);
  document.querySelectorAll('.category-card').forEach(card => card.classList.add('selected'));
  updateSelectedCount();
}

function clearCategories() {
  state.selectedCategories = [];
  document.querySelectorAll('.category-card').forEach(card => card.classList.remove('selected'));
  updateSelectedCount();
}

async function handleStartQuiz() {
  if (state.selectedCategories.length === 0) return;

  const success = await startQuiz();
  if (!success) {
    showToast('Inga märken att öva på', 'error');
    return;
  }

  showScreen('quiz');
  renderQuestion();
}

function renderQuestion() {
  const question = loadCurrentQuestion();
  if (!question) return;

  const progress = getQuizProgress();

  // Update progress bar
  const progressFill = document.getElementById('progress-fill');
  if (progressFill) progressFill.style.width = `${progress.percentage}%`;

  // Update counters
  const questionCounter = document.getElementById('question-counter');
  const correctCounter = document.getElementById('correct-counter');
  const streakCounter = document.getElementById('streak-counter');

  if (questionCounter) questionCounter.textContent = `${progress.current} / ${progress.total}`;
  if (correctCounter) correctCounter.textContent = `${progress.correct} rätt`;
  if (streakCounter) streakCounter.textContent = `${progress.streak} i rad`;

  // Clear feedback and next button
  const feedback = document.getElementById('feedback');
  const nextBtn = document.getElementById('next-btn');
  if (feedback) {
    feedback.className = 'feedback';
    feedback.innerHTML = '<div class="feedback-icon" id="feedback-icon"></div><p id="feedback-text"></p>';
  }
  if (nextBtn) nextBtn.style.display = 'none';

  const questionContainer = document.getElementById('question-container');
  if (!questionContainer) return;

  if (question.type === QuestionType.IMAGE_TO_TEXT) {
    // Image to text question
    questionContainer.innerHTML = `
      <div class="sign-container">
        <img id="sign-image" class="sign-image" src="${getImageUrl(question.image)}" alt="Vägmärke">
      </div>
      <p class="question-text">${question.prompt}</p>
      <p class="question-category" id="question-category">${state.showCategoryInfo ? `Kategori: ${question.sign.categoryName}` : ''}</p>
      <div class="options" id="options">
        ${question.options.map((opt, i) => createTextOption(opt, i)).join('')}
      </div>
    `;
  } else {
    // Text to image question
    questionContainer.innerHTML = `
      <p class="question-text text-question">${question.description}</p>
      <p class="question-category" id="question-category">${state.showCategoryInfo ? `Kategori: ${question.sign.categoryName}` : ''}</p>
      <div class="options image-options" id="options">
        ${question.options.map((opt, i) => createImageOption(opt, i)).join('')}
      </div>
    `;
  }

  // Bind option click handlers
  document.querySelectorAll('.option').forEach(optBtn => {
    optBtn.addEventListener('click', () => handleAnswer(optBtn));
  });
}

async function handleAnswer(optionBtn) {
  const optionId = optionBtn.dataset.optionId;

  // Disable all options
  document.querySelectorAll('.option').forEach(opt => opt.classList.add('disabled'));

  const result = await checkAnswer(optionId);

  // Show correct/incorrect
  if (result.isCorrect) {
    optionBtn.classList.add('correct');
  } else {
    optionBtn.classList.add('incorrect');
    // Highlight correct answer
    document.querySelectorAll('.option').forEach(opt => {
      if (opt.dataset.optionId === result.correctAnswer.id) {
        opt.classList.add('correct');
      }
    });
  }

  // Update counters
  const correctCounter = document.getElementById('correct-counter');
  const streakCounter = document.getElementById('streak-counter');
  if (correctCounter) correctCounter.textContent = `${getQuizProgress().correct} rätt`;
  if (streakCounter) streakCounter.textContent = `${result.streak} i rad`;

  // Show feedback
  const feedbackContainer = document.getElementById('feedback');
  if (feedbackContainer) {
    feedbackContainer.outerHTML = createFeedback(result.isCorrect, result.correctAnswer.name);
  }

  // Show next button
  const nextBtn = document.getElementById('next-btn');
  if (nextBtn) nextBtn.style.display = 'block';
}

async function handleNextQuestion() {
  const hasMore = nextQuestion();

  if (hasMore) {
    renderQuestion();
  } else {
    await finishQuiz();
    showResults();
  }
}

function showResults() {
  showScreen('results');

  const results = getQuizResults();

  const scoreText = document.getElementById('score-text');
  const scoreCircle = document.getElementById('score-circle');
  const finalCorrect = document.getElementById('final-correct');
  const finalIncorrect = document.getElementById('final-incorrect');

  if (scoreText) scoreText.textContent = `${results.percentage}%`;
  if (scoreCircle) scoreCircle.style.setProperty('--score', `${results.percentage}%`);
  if (finalCorrect) finalCorrect.textContent = results.correctAnswers;
  if (finalIncorrect) finalIncorrect.textContent = results.incorrectAnswers;

  // Render missed answers
  const missedList = document.getElementById('missed-list');
  const missedGrid = document.getElementById('missed-grid');

  if (missedGrid && missedList) {
    if (results.wrongAnswers.length === 0) {
      missedList.hidden = true;
    } else {
      missedGrid.innerHTML = results.wrongAnswers.slice(0, 8)
        .map(sign => createMissedCard(sign))
        .join('');
      missedList.hidden = false;
    }
  }
}

function showScreen(screenName) {
  state.currentScreen = screenName;

  const screens = ['start-screen', 'quiz-screen', 'results-screen', 'dashboard-screen'];
  screens.forEach(screen => {
    const el = document.getElementById(screen);
    if (el) el.style.display = screen === `${screenName}-screen` ? 'block' : 'none';
  });
}

function backToStart() {
  showScreen('start');
}

async function showDashboard() {
  showScreen('dashboard');

  const dashboardContainer = document.getElementById('dashboard-container');
  if (dashboardContainer) {
    await renderDashboard(dashboardContainer, state.signData, {
      onBack: () => showScreen('start'),
      onStartQuiz: (mode, category) => {
        if (mode) state.quizMode = mode;
        if (category) {
          state.selectedCategories = [category];
        } else if (state.selectedCategories.length === 0) {
          selectAllCategories();
        }
        handleStartQuiz();
      }
    });
  }
}

function applySettingsToUi() {
  const questionCount = document.getElementById('question-count');
  const shuffleOptions = document.getElementById('shuffle-options');
  const showCategory = document.getElementById('show-category');
  const quizMode = document.getElementById('quiz-mode');
  const questionType = document.getElementById('question-type');
  const difficulty = document.getElementById('difficulty');

  if (questionCount) questionCount.value = String(state.questionsPerQuiz);
  if (shuffleOptions) shuffleOptions.checked = state.shuffleOptions;
  if (showCategory) showCategory.checked = state.showCategoryInfo;
  if (quizMode) quizMode.value = state.quizMode;
  if (questionType) questionType.value = state.questionType;
  if (difficulty) difficulty.value = state.difficulty;
}

function openSettings() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.hidden = false;
}

function closeSettings() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.hidden = true;
}

function bindEvents() {
  // Start screen
  document.getElementById('start-btn')?.addEventListener('click', handleStartQuiz);
  document.getElementById('select-all')?.addEventListener('click', selectAllCategories);
  document.getElementById('clear-all')?.addEventListener('click', clearCategories);

  // Settings modal
  document.getElementById('settings-btn')?.addEventListener('click', openSettings);
  document.getElementById('close-settings')?.addEventListener('click', closeSettings);
  document.getElementById('settings-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettings();
  });

  // Quiz screen
  document.getElementById('next-btn')?.addEventListener('click', handleNextQuestion);

  // Results screen
  document.getElementById('retry-btn')?.addEventListener('click', handleStartQuiz);
  document.getElementById('back-btn')?.addEventListener('click', backToStart);

  // Dashboard
  document.getElementById('dashboard-btn')?.addEventListener('click', showDashboard);
  document.getElementById('dashboard-btn-main')?.addEventListener('click', showDashboard);

  // Settings
  document.getElementById('question-count')?.addEventListener('change', e => {
    state.questionsPerQuiz = Number(e.target.value);
    saveSettings();
  });

  document.getElementById('shuffle-options')?.addEventListener('change', e => {
    state.shuffleOptions = e.target.checked;
    saveSettings();
  });

  document.getElementById('show-category')?.addEventListener('change', e => {
    state.showCategoryInfo = e.target.checked;
    saveSettings();
  });

  document.getElementById('quiz-mode')?.addEventListener('change', e => {
    state.quizMode = e.target.value;
    saveSettings();
  });

  document.getElementById('question-type')?.addEventListener('change', e => {
    state.questionType = e.target.value;
    saveSettings();
  });

  document.getElementById('difficulty')?.addEventListener('change', e => {
    state.difficulty = e.target.value;
    saveSettings();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('service-worker.js');
}

function setupInstallPrompt() {
  installButton = document.getElementById('install-btn');
  if (!installButton) return;

  let deferredPrompt = null;
  installButton.hidden = true;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installButton.hidden = true;
  });
}

async function init() {
  // Initialize storage
  await initDB();

  // Load settings
  loadSettings();
  applySettingsToUi();

  // Load sign data
  const signData = await loadSignData();
  state.signData = signData;

  // Render UI
  renderCategories();
  updateSelectedCount();

  // Bind events
  bindEvents();

  // Setup PWA
  registerServiceWorker();
  setupInstallPrompt();

  // Initialize ML model in background (lazy)
  setTimeout(() => {
    initPredictionModel().catch(() => {
      // Ignore ML init errors
    });
  }, 5000);

  // Add mini stats to header if available
  const miniStatsContainer = document.getElementById('mini-stats');
  if (miniStatsContainer && Object.keys(signData).length > 0) {
    miniStatsContainer.innerHTML = await createMiniStats(signData);
  }
}

// Start the app
init();
