// Dashboard UI component

import { state } from '../state.js';
import { getDashboardSummary, getPersonalizedRecommendations, getNextBestSigns } from '../learning/recommendations.js';
import { getCategoryProgress, getWeakSignsWithDetails } from '../learning/progress.js';
import { getMostLikelyToFail, isModelInitialized } from '../ml/prediction.js';

const IMAGE_BASE = 'https://www.transportstyrelsen.se/link/';

export async function renderDashboard(container, signData, callbacks) {
  container.innerHTML = '<div class="loading-spinner">Laddar statistik...</div>';

  try {
    const [summary, recommendations, categoryProgress, weakSigns] = await Promise.all([
      getDashboardSummary(signData),
      getPersonalizedRecommendations(signData),
      getCategoryProgress(signData),
      getWeakSignsWithDetails(signData, 6)
    ]);

    // Get ML predictions if model is ready
    let mlPredictions = [];
    if (isModelInitialized()) {
      try {
        mlPredictions = await getMostLikelyToFail(signData, 5);
      } catch {
        // Ignore ML errors
      }
    }

    container.innerHTML = `
      <div class="dashboard">
        <div class="dashboard-header">
          <h2>Din Progress</h2>
          <button class="ghost-btn" id="back-from-dashboard">Tillbaka</button>
        </div>

        <div class="stats-cards">
          <div class="stat-card">
            <div class="stat-card-value">${summary.studiedSigns}</div>
            <div class="stat-card-label">Märken studerade</div>
            <div class="stat-card-sub">av ${summary.totalSigns} totalt</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-value">${summary.accuracy}%</div>
            <div class="stat-card-label">Träffsäkerhet</div>
          </div>
          <div class="stat-card accent">
            <div class="stat-card-value">${summary.streak}</div>
            <div class="stat-card-label">Dagars streak</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-value">${summary.masteredSigns}</div>
            <div class="stat-card-label">Bemästrade</div>
          </div>
        </div>

        <div class="mastery-bar">
          <div class="mastery-bar-label">
            <span>Total behärskning</span>
            <span>${Math.round((summary.masteredSigns / summary.totalSigns) * 100)}%</span>
          </div>
          <div class="mastery-bar-track">
            <div class="mastery-bar-fill" style="width: ${(summary.masteredSigns / summary.totalSigns) * 100}%"></div>
          </div>
        </div>

        ${recommendations.length > 0 ? `
          <div class="dashboard-section">
            <h3>Rekommendationer</h3>
            <div class="recommendations">
              ${recommendations.slice(0, 3).map(rec => `
                <div class="recommendation-card ${rec.priority}">
                  <div class="recommendation-icon">${rec.icon}</div>
                  <div class="recommendation-content">
                    <div class="recommendation-title">${rec.title}</div>
                    <div class="recommendation-desc">${rec.description}</div>
                  </div>
                  <button class="btn btn-small" data-action="${rec.action}" ${rec.categoryKey ? `data-category="${rec.categoryKey}"` : ''}>
                    Starta
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="dashboard-section">
          <h3>Kategoriframsteg</h3>
          <div class="category-progress-list">
            ${categoryProgress.map(cat => `
              <div class="category-progress-item">
                <div class="category-progress-header">
                  <span class="category-progress-icon">${cat.icon}</span>
                  <span class="category-progress-name">${cat.name}</span>
                  <span class="category-progress-stats">${cat.studied}/${cat.total}</span>
                </div>
                <div class="category-progress-bar">
                  <div class="category-progress-fill" style="width: ${cat.progress * 100}%; background: ${cat.color}"></div>
                  <div class="category-mastery-fill" style="width: ${cat.masteryProgress * 100}%; background: var(--success)"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        ${weakSigns.length > 0 ? `
          <div class="dashboard-section">
            <h3>Svagaste märken</h3>
            <div class="weak-signs-grid">
              ${weakSigns.map(sign => `
                <div class="weak-sign-card">
                  <img src="${IMAGE_BASE}${sign.img}.aspx" alt="${sign.name}">
                  <div class="weak-sign-info">
                    <div class="weak-sign-name">${sign.name}</div>
                    <div class="weak-sign-accuracy" style="color: ${sign.mastery.color}">
                      ${Math.round(sign.accuracy * 100)}% rätt
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
            <button class="btn btn-secondary" id="practice-weak">Öva svagaste</button>
          </div>
        ` : ''}

        ${mlPredictions.length > 0 ? `
          <div class="dashboard-section ml-section">
            <h3>AI-rekommendationer</h3>
            <p class="section-desc">Märken du troligen behöver öva mer på:</p>
            <div class="ml-predictions">
              ${mlPredictions.map(pred => `
                <div class="ml-prediction-card">
                  <img src="${IMAGE_BASE}${pred.img}.aspx" alt="${pred.name}">
                  <div class="ml-prediction-info">
                    <div class="ml-prediction-name">${pred.name}</div>
                    <div class="ml-prediction-prob">${Math.round(pred.failProbability * 100)}% risk</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="dashboard-actions">
          <button class="btn" id="quick-practice">Snabbövning</button>
          <button class="btn btn-secondary" id="spaced-practice">Repetera</button>
        </div>
      </div>
    `;

    // Bind events
    container.querySelector('#back-from-dashboard')?.addEventListener('click', () => {
      callbacks.onBack?.();
    });

    container.querySelector('#practice-weak')?.addEventListener('click', () => {
      callbacks.onStartQuiz?.('weakest');
    });

    container.querySelector('#quick-practice')?.addEventListener('click', () => {
      callbacks.onStartQuiz?.('standard');
    });

    container.querySelector('#spaced-practice')?.addEventListener('click', () => {
      callbacks.onStartQuiz?.('spaced');
    });

    container.querySelectorAll('.recommendation-card .btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const category = btn.dataset.category;
        callbacks.onStartQuiz?.(action, category);
      });
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    container.innerHTML = `
      <div class="error-message">
        <p>Kunde inte ladda statistik</p>
        <button class="btn btn-secondary" id="retry-dashboard">Försök igen</button>
      </div>
    `;
    container.querySelector('#retry-dashboard')?.addEventListener('click', () => {
      renderDashboard(container, signData, callbacks);
    });
  }
}

// Create mini stats widget for start screen
export async function createMiniStats(signData) {
  try {
    const summary = await getDashboardSummary(signData);

    return `
      <div class="mini-stats">
        <div class="mini-stat">
          <span class="mini-stat-value">${summary.studiedSigns}/${summary.totalSigns}</span>
          <span class="mini-stat-label">märken</span>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-value">${summary.accuracy}%</span>
          <span class="mini-stat-label">träff</span>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-value">${summary.streak}</span>
          <span class="mini-stat-label">streak</span>
        </div>
      </div>
    `;
  } catch {
    return '';
  }
}
