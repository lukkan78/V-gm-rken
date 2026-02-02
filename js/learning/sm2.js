// SM-2 Spaced Repetition Algorithm
// Based on the SuperMemo 2 algorithm by Piotr Wozniak

import { put, get, STORES } from '../utils/storage.js';

// Quality ratings for SM-2
export const Quality = {
  COMPLETE_BLACKOUT: 0,      // Complete failure to recall
  INCORRECT: 1,              // Incorrect response, but upon seeing correct answer it seemed familiar
  INCORRECT_EASY_RECALL: 2,  // Incorrect response, but correct answer seemed easy to recall
  CORRECT_DIFFICULTY: 3,     // Correct response after hesitation
  CORRECT: 4,                // Correct response with slight hesitation
  PERFECT: 5                 // Perfect response
};

// Convert quiz response to quality rating
export function responseToQuality(isCorrect, responseTimeMs, averageTimeMs) {
  if (!isCorrect) {
    return responseTimeMs < 3000 ? Quality.INCORRECT : Quality.COMPLETE_BLACKOUT;
  }

  const timeFactor = responseTimeMs / (averageTimeMs || 3000);

  if (timeFactor < 0.5) return Quality.PERFECT;
  if (timeFactor < 1.0) return Quality.CORRECT;
  return Quality.CORRECT_DIFFICULTY;
}

// Core SM-2 algorithm
export function calculateSM2(quality, easeFactor, interval, repetitions) {
  let newEF = easeFactor;
  let newInterval = interval;
  let newReps = repetitions;

  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  // EF must be at least 1.3
  newEF = Math.max(1.3, newEF);

  if (quality < 3) {
    // If response was incorrect, restart repetitions
    newReps = 0;
    newInterval = 1;
  } else {
    // Correct response
    newReps = repetitions + 1;

    if (newReps === 1) {
      newInterval = 1;
    } else if (newReps === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * newEF);
    }
  }

  return {
    easeFactor: newEF,
    interval: newInterval,
    repetitions: newReps
  };
}

// Calculate next review date
export function getNextReviewDate(intervalDays) {
  const date = new Date();
  date.setDate(date.getDate() + intervalDays);
  return date.toISOString();
}

// Update sign progress with SM-2
export async function updateWithSM2(signId, category, isCorrect, responseTimeMs) {
  let progress = await get(STORES.SIGN_PROGRESS, signId);

  if (!progress) {
    progress = {
      signId,
      category,
      totalAttempts: 0,
      correctAttempts: 0,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      nextReviewDate: new Date().toISOString(),
      lastAttemptDate: null,
      averageResponseTime: 3000
    };
  }

  // Calculate quality based on response
  const quality = responseToQuality(isCorrect, responseTimeMs, progress.averageResponseTime);

  // Apply SM-2 algorithm
  const sm2Result = calculateSM2(
    quality,
    progress.easeFactor,
    progress.interval,
    progress.repetitions
  );

  // Update progress
  progress.totalAttempts++;
  progress.lastAttemptDate = new Date().toISOString();

  // Update average response time
  const prevTotal = progress.averageResponseTime * (progress.totalAttempts - 1);
  progress.averageResponseTime = (prevTotal + responseTimeMs) / progress.totalAttempts;

  if (isCorrect) {
    progress.correctAttempts++;
  }

  progress.easeFactor = sm2Result.easeFactor;
  progress.interval = sm2Result.interval;
  progress.repetitions = sm2Result.repetitions;
  progress.nextReviewDate = getNextReviewDate(sm2Result.interval);
  progress.lastQuality = quality;

  await put(STORES.SIGN_PROGRESS, progress);

  return progress;
}

// Get retention score (0-100) for a sign
export function getRetentionScore(progress) {
  if (!progress || progress.totalAttempts === 0) {
    return 0;
  }

  const accuracy = progress.correctAttempts / progress.totalAttempts;
  const efFactor = (progress.easeFactor - 1.3) / (2.5 - 1.3); // Normalized 0-1
  const repsFactor = Math.min(1, progress.repetitions / 5); // Max out at 5 reps

  // Weighted combination
  return Math.round((accuracy * 0.5 + efFactor * 0.3 + repsFactor * 0.2) * 100);
}

// Get mastery level for display
export function getMasteryLevel(progress) {
  const score = getRetentionScore(progress);

  if (score >= 90) return { level: 'master', label: 'Mästare', color: '#FFD700' };
  if (score >= 70) return { level: 'proficient', label: 'Kunnig', color: '#00FF88' };
  if (score >= 50) return { level: 'learning', label: 'Lär sig', color: '#00D4AA' };
  if (score >= 25) return { level: 'beginner', label: 'Nybörjare', color: '#4682B4' };
  return { level: 'new', label: 'Ny', color: '#808080' };
}

// Check if a sign is due for review
export function isDueForReview(progress) {
  if (!progress) return true;
  return new Date(progress.nextReviewDate) <= new Date();
}

// Get signs that are overdue
export function getOverdueCount(progressList) {
  const now = new Date();
  return progressList.filter(p => new Date(p.nextReviewDate) <= now).length;
}

// Calculate study recommendation
export function getStudyRecommendation(progressList, allSigns) {
  const now = new Date();
  const overdue = progressList.filter(p => new Date(p.nextReviewDate) <= now);
  const studied = new Set(progressList.map(p => p.signId));
  const newSigns = allSigns.filter(s => !studied.has(s.id));

  if (overdue.length >= 10) {
    return {
      mode: 'spaced',
      reason: `Du har ${overdue.length} märken att repetera`,
      priority: 'high'
    };
  }

  if (newSigns.length > 0 && overdue.length < 5) {
    return {
      mode: 'standard',
      reason: `Lär dig ${Math.min(10, newSigns.length)} nya märken`,
      priority: 'medium'
    };
  }

  if (overdue.length > 0) {
    return {
      mode: 'spaced',
      reason: `Repetera ${overdue.length} märken`,
      priority: 'medium'
    };
  }

  return {
    mode: 'standard',
    reason: 'Fortsätt öva för att bibehålla kunskapen',
    priority: 'low'
  };
}
