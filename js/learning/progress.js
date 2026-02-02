// User progress tracking and recommendations

import { getAll, getDueForReview, getWeakestSigns, STORES } from '../utils/storage.js';
import { getRetentionScore, getMasteryLevel, getStudyRecommendation } from './sm2.js';

// Get overall learning statistics
export async function getLearningStats(signData) {
  const allProgress = await getAll(STORES.SIGN_PROGRESS);
  const progressMap = new Map(allProgress.map(p => [p.signId, p]));

  let totalSigns = 0;
  let studiedSigns = 0;
  let masteredSigns = 0;
  let totalAttempts = 0;
  let totalCorrect = 0;

  const categoryStats = {};

  Object.entries(signData).forEach(([catKey, category]) => {
    const catStats = {
      name: category.name,
      code: category.code,
      icon: category.icon,
      color: category.color,
      total: category.signs.length,
      studied: 0,
      mastered: 0,
      accuracy: 0,
      totalAttempts: 0,
      correctAttempts: 0
    };

    category.signs.forEach(sign => {
      totalSigns++;
      const progress = progressMap.get(sign.id);

      if (progress && progress.totalAttempts > 0) {
        studiedSigns++;
        catStats.studied++;
        catStats.totalAttempts += progress.totalAttempts;
        catStats.correctAttempts += progress.correctAttempts;
        totalAttempts += progress.totalAttempts;
        totalCorrect += progress.correctAttempts;

        const retention = getRetentionScore(progress);
        if (retention >= 80) {
          masteredSigns++;
          catStats.mastered++;
        }
      }
    });

    catStats.accuracy = catStats.totalAttempts > 0
      ? catStats.correctAttempts / catStats.totalAttempts
      : 0;

    categoryStats[catKey] = catStats;
  });

  return {
    totalSigns,
    studiedSigns,
    masteredSigns,
    newSigns: totalSigns - studiedSigns,
    overallAccuracy: totalAttempts > 0 ? totalCorrect / totalAttempts : 0,
    totalAttempts,
    categoryStats
  };
}

// Get signs due for review today
export async function getTodayReviewSigns(signData) {
  const dueProgress = await getDueForReview(50);
  const dueIds = new Set(dueProgress.map(p => p.signId));

  const signs = [];

  Object.entries(signData).forEach(([catKey, category]) => {
    category.signs.forEach(sign => {
      if (dueIds.has(sign.id)) {
        signs.push({
          ...sign,
          category: catKey,
          categoryName: category.name,
          progress: dueProgress.find(p => p.signId === sign.id)
        });
      }
    });
  });

  return signs;
}

// Get weakest signs that need practice
export async function getWeakSignsWithDetails(signData, limit = 10) {
  const weakest = await getWeakestSigns(limit);
  const weakIds = new Map(weakest.map(w => [w.signId, w]));

  const signs = [];

  Object.entries(signData).forEach(([catKey, category]) => {
    category.signs.forEach(sign => {
      const progress = weakIds.get(sign.id);
      if (progress) {
        const mastery = getMasteryLevel(progress);
        signs.push({
          ...sign,
          category: catKey,
          categoryName: category.name,
          accuracy: progress.correctAttempts / progress.totalAttempts,
          totalAttempts: progress.totalAttempts,
          mastery
        });
      }
    });
  });

  // Sort by accuracy (lowest first)
  return signs.sort((a, b) => a.accuracy - b.accuracy);
}

// Get study recommendation based on current progress
export async function getRecommendation(signData) {
  const allProgress = await getAll(STORES.SIGN_PROGRESS);

  // Flatten all signs
  const allSigns = [];
  Object.entries(signData).forEach(([catKey, category]) => {
    category.signs.forEach(sign => {
      allSigns.push({ ...sign, category: catKey });
    });
  });

  return getStudyRecommendation(allProgress, allSigns);
}

// Get learning streak (consecutive days with practice)
export async function getLearningStreak() {
  const sessions = await getAll(STORES.QUIZ_SESSIONS);
  if (sessions.length === 0) return 0;

  // Get unique dates
  const dates = [...new Set(
    sessions.map(s => new Date(s.date).toDateString())
  )].sort((a, b) => new Date(b) - new Date(a));

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  // Check if practiced today or yesterday
  if (dates[0] !== today && dates[0] !== yesterday) {
    return 0;
  }

  let streak = 0;
  const startDate = dates[0] === today ? new Date() : new Date(Date.now() - 86400000);

  for (let i = 0; i < dates.length; i++) {
    const expectedDate = new Date(startDate);
    expectedDate.setDate(expectedDate.getDate() - i);
    const expected = expectedDate.toDateString();

    if (dates[i] === expected) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// Get progress for a specific sign
export async function getSignProgress(signId) {
  const allProgress = await getAll(STORES.SIGN_PROGRESS);
  const progress = allProgress.find(p => p.signId === signId);

  if (!progress) {
    return {
      studied: false,
      mastery: { level: 'new', label: 'Ny', color: '#808080' },
      retention: 0
    };
  }

  return {
    studied: true,
    mastery: getMasteryLevel(progress),
    retention: getRetentionScore(progress),
    accuracy: progress.correctAttempts / progress.totalAttempts,
    totalAttempts: progress.totalAttempts,
    lastPracticed: progress.lastAttemptDate,
    nextReview: progress.nextReviewDate
  };
}

// Get category progress summary
export async function getCategoryProgress(signData) {
  const stats = await getLearningStats(signData);
  const categories = [];

  Object.entries(stats.categoryStats).forEach(([key, stat]) => {
    categories.push({
      key,
      ...stat,
      progress: stat.total > 0 ? stat.studied / stat.total : 0,
      masteryProgress: stat.total > 0 ? stat.mastered / stat.total : 0
    });
  });

  // Sort by progress (lowest first for recommendations)
  return categories.sort((a, b) => a.progress - b.progress);
}
