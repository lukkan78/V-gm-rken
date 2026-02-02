// Reusable UI components

const IMAGE_BASE = 'https://www.transportstyrelsen.se/link/';

// Status banner
export function showStatus(message, isError = false) {
  const banner = document.getElementById('status-banner');
  if (!banner) return;

  banner.hidden = false;
  banner.textContent = message;
  banner.className = `status-banner ${isError ? 'error' : 'success'}`;
}

export function hideStatus() {
  const banner = document.getElementById('status-banner');
  if (banner) banner.hidden = true;
}

// Loading spinner
export function createSpinner(message = 'Laddar...') {
  return `<div class="loading-spinner"><div class="spinner"></div><span>${message}</span></div>`;
}

// Category card
export function createCategoryCard(key, category, isSelected = false) {
  const selectedClass = isSelected ? 'selected' : '';
  const colorStyle = category.color ? `--category-color: ${category.color}` : '';

  // Get first sign image from category
  const previewSign = category.signs && category.signs.length > 0 ? category.signs[0] : null;
  const previewImg = previewSign ? `${IMAGE_BASE}${previewSign.img}.aspx` : '';

  return `
    <div class="category-card ${selectedClass}" data-category="${key}" style="${colorStyle}">
      <div class="category-preview">
        ${previewImg ? `<img src="${previewImg}" alt="${category.name}" loading="lazy">` : ''}
      </div>
      <div class="category-info">
        <div class="category-name">${category.name}</div>
        <div class="category-count">${category.signs.length} märken</div>
      </div>
      ${category.code ? `<div class="category-code">${category.code}</div>` : ''}
    </div>
  `;
}

// Sign image
export function createSignImage(imgHash, name, size = 'medium') {
  return `<img
    src="${IMAGE_BASE}${imgHash}.aspx"
    alt="${name}"
    class="sign-image sign-image-${size}"
    loading="lazy"
  >`;
}

// Option button for image-to-text
export function createTextOption(option, index) {
  return `
    <button class="option" data-option-id="${option.id}" data-index="${index}">
      ${option.name}
    </button>
  `;
}

// Option button for text-to-image
export function createImageOption(option, index) {
  return `
    <button class="option image-option" data-option-id="${option.id}" data-index="${index}">
      <img src="${IMAGE_BASE}${option.img}.aspx" alt="Alternativ ${index + 1}" loading="lazy">
    </button>
  `;
}

// Progress bar
export function createProgressBar(current, total) {
  const percentage = (current / total) * 100;
  return `
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${percentage}%"></div>
    </div>
  `;
}

// Score circle
export function createScoreCircle(percentage) {
  return `
    <div class="score-circle" style="--score: ${percentage}%">
      <span class="score-text">${percentage}%</span>
    </div>
  `;
}

// Missed sign card
export function createMissedCard(sign) {
  return `
    <div class="missed-card">
      <img src="${IMAGE_BASE}${sign.img}.aspx" alt="${sign.name}">
      <strong>${sign.id}</strong>
      <p>${sign.name}</p>
    </div>
  `;
}

// Feedback display
export function createFeedback(isCorrect, correctAnswer) {
  const icon = isCorrect ? '✅' : '❌';
  const text = isCorrect ? 'Helt rätt!' : `Rätt svar: ${correctAnswer}`;
  const className = isCorrect ? 'correct' : 'incorrect';

  return `
    <div class="feedback ${className}" id="feedback">
      <div class="feedback-icon" id="feedback-icon">${icon}</div>
      <p id="feedback-text">${text}</p>
    </div>
  `;
}

// Quiz mode selector
export function createQuizModeSelector(currentMode) {
  const modes = [
    { value: 'standard', label: 'Standard', icon: '📝', desc: 'Slumpmässiga frågor' },
    { value: 'spaced', label: 'Repetera', icon: '🔄', desc: 'Spaced repetition' },
    { value: 'weakest', label: 'Svaga', icon: '🎯', desc: 'Dina svagaste märken' },
    { value: 'missed', label: 'Missade', icon: '❌', desc: 'Senast missade' }
  ];

  return `
    <div class="quiz-mode-selector">
      ${modes.map(mode => `
        <button class="mode-option ${currentMode === mode.value ? 'selected' : ''}" data-mode="${mode.value}">
          <span class="mode-icon">${mode.icon}</span>
          <span class="mode-label">${mode.label}</span>
          <span class="mode-desc">${mode.desc}</span>
        </button>
      `).join('')}
    </div>
  `;
}

// Question type selector
export function createQuestionTypeSelector(currentType) {
  const types = [
    { value: 'mixed', label: 'Blandat', icon: '🔀' },
    { value: 'image-to-text', label: 'Bild → Text', icon: '🖼️' },
    { value: 'text-to-image', label: 'Text → Bild', icon: '📝' }
  ];

  return `
    <div class="question-type-selector">
      ${types.map(type => `
        <button class="type-option ${currentType === type.value ? 'selected' : ''}" data-type="${type.value}">
          <span class="type-icon">${type.icon}</span>
          <span class="type-label">${type.label}</span>
        </button>
      `).join('')}
    </div>
  `;
}

// Difficulty selector
export function createDifficultySelector(currentDifficulty) {
  const difficulties = [
    { value: 'easy', label: 'Lätt', color: '#00ff88' },
    { value: 'medium', label: 'Medel', color: '#00d4aa' },
    { value: 'hard', label: 'Svår', color: '#ff6347' },
    { value: 'adaptive', label: 'Adaptiv', color: '#9370db' }
  ];

  return `
    <div class="difficulty-selector">
      ${difficulties.map(diff => `
        <button class="difficulty-option ${currentDifficulty === diff.value ? 'selected' : ''}"
                data-difficulty="${diff.value}"
                style="--diff-color: ${diff.color}">
          ${diff.label}
        </button>
      `).join('')}
    </div>
  `;
}

// Streak display
export function createStreakDisplay(current, best) {
  return `
    <div class="streak-display">
      <div class="streak-current">
        <span class="streak-icon">🔥</span>
        <span class="streak-value">${current}</span>
        <span class="streak-label">i rad</span>
      </div>
      ${best > 0 ? `
        <div class="streak-best">
          Bäst: ${best}
        </div>
      ` : ''}
    </div>
  `;
}

// Navigation tabs
export function createNavTabs(activeTab) {
  const tabs = [
    { id: 'quiz', label: 'Quiz', icon: '📝' },
    { id: 'dashboard', label: 'Statistik', icon: '📊' }
  ];

  return `
    <nav class="nav-tabs">
      ${tabs.map(tab => `
        <button class="nav-tab ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
          <span class="nav-tab-icon">${tab.icon}</span>
          <span class="nav-tab-label">${tab.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

// Toast notification
let toastTimeout = null;

export function showToast(message, type = 'info', duration = 3000) {
  let toast = document.getElementById('toast');

  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `toast ${type} show`;

  if (toastTimeout) clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    toast.className = 'toast';
  }, duration);
}

// Confirmation dialog
export function showConfirmDialog(title, message, onConfirm, onCancel) {
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay';
  dialog.innerHTML = `
    <div class="confirm-dialog">
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="confirm-dialog-buttons">
        <button class="btn btn-secondary" id="confirm-cancel">Avbryt</button>
        <button class="btn" id="confirm-ok">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.querySelector('#confirm-cancel').addEventListener('click', () => {
    document.body.removeChild(dialog);
    onCancel?.();
  });

  dialog.querySelector('#confirm-ok').addEventListener('click', () => {
    document.body.removeChild(dialog);
    onConfirm?.();
  });
}
