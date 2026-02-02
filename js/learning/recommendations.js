// Smart recommendations based on learning data

import { getAll, getDueForReview, STORES } from '../utils/storage.js';
import { getRetentionScore, getMasteryLevel } from './sm2.js';

// Get personalized recommendations
export async function getPersonalizedRecommendations(signData) {
  const [allProgress, dueForReview, sessions] = await Promise.all([
    getAll(STORES.SIGN_PROGRESS),
    getDueForReview(20),
    getAll(STORES.QUIZ_SESSIONS)
  ]);

  const progressMap = new Map(allProgress.map(p => [p.signId, p]));
  const recommendations = [];

  // Count total signs
  let totalSigns = 0;
  let studiedSigns = 0;

  Object.values(signData).forEach(cat => {
    totalSigns += cat.signs.length;
    cat.signs.forEach(sign => {
      if (progressMap.has(sign.id)) studiedSigns++;
    });
  });

  // Recommendation: Review due signs
  if (dueForReview.length > 0) {
    recommendations.push({
      type: 'review',
      priority: 'high',
      title: 'Dags att repetera',
      description: `Du har ${dueForReview.length} märken som är redo för repetition`,
      action: 'spaced',
      icon: '🔄'
    });
  }

  // Recommendation: Practice weak categories
  const categoryAccuracy = {};
  allProgress.forEach(p => {
    if (!categoryAccuracy[p.category]) {
      categoryAccuracy[p.category] = { correct: 0, total: 0 };
    }
    categoryAccuracy[p.category].total += p.totalAttempts;
    categoryAccuracy[p.category].correct += p.correctAttempts;
  });

  const weakCategories = Object.entries(categoryAccuracy)
    .map(([key, stats]) => ({
      key,
      accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
      attempts: stats.total
    }))
    .filter(c => c.attempts >= 5 && c.accuracy < 0.7)
    .sort((a, b) => a.accuracy - b.accuracy);

  if (weakCategories.length > 0) {
    const weakCat = weakCategories[0];
    const catName = signData[weakCat.key]?.name || weakCat.key;
    recommendations.push({
      type: 'weak_category',
      priority: 'medium',
      title: 'Fokusera på svagaste kategorin',
      description: `${catName} har ${Math.round(weakCat.accuracy * 100)}% träffsäkerhet`,
      action: 'category',
      categoryKey: weakCat.key,
      icon: '🎯'
    });
  }

  // Recommendation: Learn new signs
  const newSignsCount = totalSigns - studiedSigns;
  if (newSignsCount > 0 && dueForReview.length < 10) {
    recommendations.push({
      type: 'new_signs',
      priority: newSignsCount > 50 ? 'medium' : 'low',
      title: 'Lär dig nya märken',
      description: `${newSignsCount} märken väntar på att upptäckas`,
      action: 'standard',
      icon: '📚'
    });
  }

  // Recommendation: Maintain streak
  const today = new Date().toDateString();
  const practicedToday = sessions.some(s =>
    new Date(s.date).toDateString() === today
  );

  if (!practicedToday) {
    recommendations.push({
      type: 'streak',
      priority: 'low',
      title: 'Håll din streak igång',
      description: 'Du har inte övat idag ännu',
      action: 'standard',
      icon: '🔥'
    });
  }

  // Recommendation: Challenge yourself
  const avgAccuracy = allProgress.length > 0
    ? allProgress.reduce((sum, p) => sum + p.correctAttempts / p.totalAttempts, 0) / allProgress.length
    : 0;

  if (avgAccuracy > 0.8 && studiedSigns > 20) {
    recommendations.push({
      type: 'challenge',
      priority: 'low',
      title: 'Utmana dig själv',
      description: 'Du är duktig! Prova en svårare quiz',
      action: 'hard',
      icon: '💪'
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations;
}

// Get next best signs to study
export async function getNextBestSigns(signData, count = 10) {
  const allProgress = await getAll(STORES.SIGN_PROGRESS);
  const progressMap = new Map(allProgress.map(p => [p.signId, p]));

  const scored = [];

  Object.entries(signData).forEach(([catKey, category]) => {
    category.signs.forEach(sign => {
      const progress = progressMap.get(sign.id);
      let score = 50; // Base score for new signs

      if (progress) {
        const retention = getRetentionScore(progress);
        const daysSinceReview = progress.lastAttemptDate
          ? (Date.now() - new Date(progress.lastAttemptDate).getTime()) / 86400000
          : 100;

        // Higher score = more urgent to study
        if (new Date(progress.nextReviewDate) <= new Date()) {
          score = 100 - retention + daysSinceReview * 2;
        } else {
          score = 10 - retention * 0.1;
        }
      }

      scored.push({
        ...sign,
        category: catKey,
        categoryName: category.name,
        score,
        progress
      });
    });
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, count).map(s => ({
    id: s.id,
    name: s.name,
    img: s.img,
    category: s.category,
    categoryName: s.categoryName,
    mastery: s.progress ? getMasteryLevel(s.progress) : { level: 'new', label: 'Ny', color: '#808080' }
  }));
}

// Get summary stats for dashboard
export async function getDashboardSummary(signData) {
  const [allProgress, sessions] = await Promise.all([
    getAll(STORES.SIGN_PROGRESS),
    getAll(STORES.QUIZ_SESSIONS)
  ]);

  let totalSigns = 0;
  let studiedSigns = 0;
  let masteredSigns = 0;
  let totalAttempts = 0;
  let correctAttempts = 0;

  const progressMap = new Map(allProgress.map(p => [p.signId, p]));

  Object.values(signData).forEach(cat => {
    totalSigns += cat.signs.length;
    cat.signs.forEach(sign => {
      const progress = progressMap.get(sign.id);
      if (progress) {
        studiedSigns++;
        totalAttempts += progress.totalAttempts;
        correctAttempts += progress.correctAttempts;

        if (getRetentionScore(progress) >= 80) {
          masteredSigns++;
        }
      }
    });
  });

  // Calculate streak
  const today = new Date().toDateString();
  const sessionDates = [...new Set(
    sessions.map(s => new Date(s.date).toDateString())
  )].sort((a, b) => new Date(b) - new Date(a));

  let streak = 0;
  if (sessionDates.length > 0) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (sessionDates[0] === today || sessionDates[0] === yesterday) {
      const startDate = sessionDates[0] === today ? new Date() : new Date(Date.now() - 86400000);
      for (let i = 0; i < sessionDates.length; i++) {
        const expected = new Date(startDate);
        expected.setDate(expected.getDate() - i);
        if (sessionDates[i] === expected.toDateString()) {
          streak++;
        } else {
          break;
        }
      }
    }
  }

  // Best session
  const bestSession = sessions.reduce((best, s) =>
    !best || s.percentage > best.percentage ? s : best
    , null);

  return {
    totalSigns,
    studiedSigns,
    masteredSigns,
    accuracy: totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0,
    streak,
    totalQuizzes: sessions.length,
    bestScore: bestSession?.percentage || 0
  };
}
