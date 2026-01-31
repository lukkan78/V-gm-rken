const STORAGE_KEY = 'vagmarkesforhor-settings';
const DATA_URL = 'data/signs.json';
const IMAGE_BASE = 'https://www.transportstyrelsen.se/link/';

let signData = {};
let selectedCategories = [];
let quizSigns = [];
let currentQuestion = 0;
let correctAnswers = 0;
let streak = 0;
let wrongAnswers = [];
let questionsPerQuiz = 15;
let shuffleOptions = true;
let showCategoryInfo = true;

const installButton = document.getElementById('install-btn');
const statusBanner = document.getElementById('status-banner');

function showStatus(message, isError = false) {
  statusBanner.hidden = false;
  statusBanner.textContent = message;
  statusBanner.style.borderColor = isError ? 'rgba(255, 68, 102, 0.4)' : 'rgba(0, 212, 170, 0.4)';
  statusBanner.style.background = isError ? 'rgba(255, 68, 102, 0.1)' : 'rgba(0, 212, 170, 0.1)';
  statusBanner.style.color = isError ? 'var(--danger)' : 'var(--accent)';
}

function hideStatus() {
  statusBanner.hidden = true;
}

async function loadSignData() {
  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Kunde inte läsa datafilen');
    }
    signData = await response.json();
    hideStatus();
  } catch (error) {
    showStatus('Misslyckades att ladda vägmärken. Kontrollera datafilen eller din anslutning.', true);
    signData = {};
  }
}

function saveSettings() {
  const payload = {
    questionsPerQuiz,
    shuffleOptions,
    showCategoryInfo,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadSettings() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    questionsPerQuiz = Number(parsed.questionsPerQuiz) || questionsPerQuiz;
    shuffleOptions = Boolean(parsed.shuffleOptions);
    showCategoryInfo = parsed.showCategoryInfo !== false;
  } catch (error) {
    return;
  }
}

function applySettingsToUi() {
  document.getElementById('question-count').value = String(questionsPerQuiz);
  document.getElementById('shuffle-options').checked = shuffleOptions;
  document.getElementById('show-category').checked = showCategoryInfo;
}

function renderCategories() {
  const grid = document.getElementById('category-grid');
  grid.innerHTML = '';

  Object.entries(signData).forEach(([key, category]) => {
    const card = document.createElement('div');
    card.className = 'category-card';
    card.dataset.category = key;
    card.innerHTML = `
      <div class="category-icon">${category.icon}</div>
      <div class="category-name">${category.name}</div>
      <div class="category-count">${category.signs.length} märken</div>
    `;
    card.addEventListener('click', () => toggleCategory(key, card));
    grid.appendChild(card);
  });
}

function toggleCategory(key, card) {
  const idx = selectedCategories.indexOf(key);
  if (idx > -1) {
    selectedCategories.splice(idx, 1);
    card.classList.remove('selected');
  } else {
    selectedCategories.push(key);
    card.classList.add('selected');
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = selectedCategories.length;
  const label = count === 0
    ? '0 kategorier valda'
    : count === 1
      ? '1 kategori vald'
      : `${count} kategorier valda`;
  document.getElementById('selected-count').textContent = label;
  document.getElementById('start-btn').disabled = count === 0;
}

function selectAllCategories() {
  selectedCategories = Object.keys(signData);
  document.querySelectorAll('.category-card').forEach(card => {
    card.classList.add('selected');
  });
  updateSelectedCount();
}

function clearCategories() {
  selectedCategories = [];
  document.querySelectorAll('.category-card').forEach(card => {
    card.classList.remove('selected');
  });
  updateSelectedCount();
}

function startQuiz() {
  if (selectedCategories.length === 0) return;

  quizSigns = [];
  selectedCategories.forEach(cat => {
    signData[cat].signs.forEach(sign => {
      quizSigns.push({ ...sign, category: cat, categoryName: signData[cat].name });
    });
  });

  quizSigns = shuffleArray(quizSigns).slice(0, questionsPerQuiz);
  currentQuestion = 0;
  correctAnswers = 0;
  streak = 0;
  wrongAnswers = [];

  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('quiz-screen').style.display = 'block';
  document.getElementById('results-screen').style.display = 'none';

  loadQuestion();
}

function loadQuestion() {
  const sign = quizSigns[currentQuestion];
  const img = document.getElementById('sign-image');

  img.src = `${IMAGE_BASE}${sign.img}.aspx`;
  img.alt = sign.name;

  const categoryLabel = document.getElementById('question-category');
  if (showCategoryInfo) {
    categoryLabel.textContent = `Kategori: ${sign.categoryName}`;
  } else {
    categoryLabel.textContent = '';
  }

  document.getElementById('feedback').className = 'feedback';
  document.getElementById('next-btn').style.display = 'none';

  const options = generateOptions(sign);
  const optionsContainer = document.getElementById('options');
  optionsContainer.innerHTML = '';

  options.forEach(option => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.textContent = option.name;
    btn.addEventListener('click', () => checkAnswer(option, sign.name, btn));
    optionsContainer.appendChild(btn);
  });

  updateProgress();
}

function generateOptions(correctSign) {
  let allSigns = [];
  Object.values(signData).forEach(cat => {
    allSigns = allSigns.concat(cat.signs);
  });

  allSigns = allSigns.filter(sign => sign.id !== correctSign.id);
  const wrongOptions = shuffleArray(allSigns).slice(0, 3);

  const options = [...wrongOptions, correctSign];
  return shuffleOptions ? shuffleArray(options) : options;
}

function checkAnswer(selectedSign, correctName, btn) {
  const options = document.querySelectorAll('.option');
  options.forEach(opt => opt.classList.add('disabled'));

  const isCorrect = selectedSign.name === correctName;

  if (isCorrect) {
    btn.classList.add('correct');
    correctAnswers++;
    streak++;
    document.getElementById('feedback').className = 'feedback correct';
    document.getElementById('feedback-icon').textContent = '✅';
    document.getElementById('feedback-text').textContent = 'Helt rätt!';
  } else {
    btn.classList.add('incorrect');
    streak = 0;
    options.forEach(opt => {
      if (opt.textContent === correctName) {
        opt.classList.add('correct');
      }
    });
    wrongAnswers.push(quizSigns[currentQuestion]);
    document.getElementById('feedback').className = 'feedback incorrect';
    document.getElementById('feedback-icon').textContent = '❌';
    document.getElementById('feedback-text').textContent = `Rätt svar: ${correctName}`;
  }

  document.getElementById('correct-counter').textContent = `${correctAnswers} rätt`;
  document.getElementById('streak-counter').textContent = `${streak} i rad`;
  document.getElementById('next-btn').style.display = 'block';
}

function nextQuestion() {
  currentQuestion++;

  if (currentQuestion >= quizSigns.length) {
    showResults();
  } else {
    loadQuestion();
  }
}

function updateProgress() {
  const progress = ((currentQuestion + 1) / quizSigns.length) * 100;
  document.getElementById('progress-fill').style.width = `${progress}%`;
  document.getElementById('question-counter').textContent = `${currentQuestion + 1} / ${quizSigns.length}`;
}

function showResults() {
  document.getElementById('quiz-screen').style.display = 'none';
  document.getElementById('results-screen').style.display = 'block';

  const percentage = Math.round((correctAnswers / quizSigns.length) * 100);

  document.getElementById('score-text').textContent = `${percentage}%`;
  document.getElementById('score-circle').style.setProperty('--score', `${percentage}%`);
  document.getElementById('final-correct').textContent = correctAnswers;
  document.getElementById('final-incorrect').textContent = quizSigns.length - correctAnswers;

  renderMissedAnswers();
}

function renderMissedAnswers() {
  const missedList = document.getElementById('missed-list');
  const missedGrid = document.getElementById('missed-grid');

  if (wrongAnswers.length === 0) {
    missedList.hidden = true;
    missedGrid.innerHTML = '';
    return;
  }

  missedGrid.innerHTML = '';
  wrongAnswers.slice(0, 8).forEach(sign => {
    const card = document.createElement('div');
    card.className = 'missed-card';
    card.innerHTML = `
      <img src="${IMAGE_BASE}${sign.img}.aspx" alt="${sign.name}">
      <strong>${sign.id}</strong>
      <p>${sign.name}</p>
    `;
    missedGrid.appendChild(card);
  });

  missedList.hidden = false;
}

function restartQuiz() {
  startQuiz();
}

function backToStart() {
  document.getElementById('start-screen').style.display = 'block';
  document.getElementById('quiz-screen').style.display = 'none';
  document.getElementById('results-screen').style.display = 'none';
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('service-worker.js');
}

function setupInstallPrompt() {
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

function bindEvents() {
  document.getElementById('start-btn').addEventListener('click', startQuiz);
  document.getElementById('next-btn').addEventListener('click', nextQuestion);
  document.getElementById('retry-btn').addEventListener('click', restartQuiz);
  document.getElementById('back-btn').addEventListener('click', backToStart);
  document.getElementById('select-all').addEventListener('click', selectAllCategories);
  document.getElementById('clear-all').addEventListener('click', clearCategories);

  document.getElementById('question-count').addEventListener('change', event => {
    questionsPerQuiz = Number(event.target.value);
    saveSettings();
  });

  document.getElementById('shuffle-options').addEventListener('change', event => {
    shuffleOptions = event.target.checked;
    saveSettings();
  });

  document.getElementById('show-category').addEventListener('change', event => {
    showCategoryInfo = event.target.checked;
    saveSettings();
  });
}

async function init() {
  loadSettings();
  applySettingsToUi();
  await loadSignData();
  renderCategories();
  updateSelectedCount();
  bindEvents();
  registerServiceWorker();
  setupInstallPrompt();
}

init();
