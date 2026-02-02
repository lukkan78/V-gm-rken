// TensorFlow.js prediction model for failure prediction

import { loadTensorFlow, isTensorFlowLoaded, getTensorFlow } from './tfjs-loader.js';
import { getAll, put, get, STORES } from '../utils/storage.js';

let model = null;
let isModelReady = false;

// Feature extraction for prediction
// Input features (8 total):
// 1. accuracy (0-1)
// 2. days since last practice (normalized 0-1)
// 3. sign difficulty (1-5 normalized)
// 4. total attempts (log normalized)
// 5. ease factor (normalized)
// 6. current interval (log normalized)
// 7. category familiarity (0-1)
// 8. time of day factor (0-1)

function extractFeatures(signProgress, signData, categoryStats) {
  const now = new Date();

  // 1. Accuracy
  const accuracy = signProgress.totalAttempts > 0
    ? signProgress.correctAttempts / signProgress.totalAttempts
    : 0.5;

  // 2. Days since last practice
  const daysSince = signProgress.lastAttemptDate
    ? (now - new Date(signProgress.lastAttemptDate)) / (1000 * 60 * 60 * 24)
    : 30;
  const daysSinceNorm = Math.min(1, daysSince / 30);

  // 3. Sign difficulty
  const difficulty = signData.difficulty || 3;
  const difficultyNorm = (difficulty - 1) / 4;

  // 4. Total attempts (log normalized)
  const attemptsLog = Math.log(signProgress.totalAttempts + 1) / Math.log(100);
  const attemptsNorm = Math.min(1, attemptsLog);

  // 5. Ease factor normalized
  const efNorm = (signProgress.easeFactor - 1.3) / (2.5 - 1.3);

  // 6. Interval (log normalized)
  const intervalLog = Math.log(signProgress.interval + 1) / Math.log(365);
  const intervalNorm = Math.min(1, intervalLog);

  // 7. Category familiarity
  const catStats = categoryStats[signProgress.category];
  const catFamiliarity = catStats
    ? catStats.correctAttempts / Math.max(1, catStats.totalAttempts)
    : 0.5;

  // 8. Time of day (afternoon peak performance)
  const hour = now.getHours();
  const timeOfDay = 1 - Math.abs(hour - 14) / 12; // Peak at 2 PM

  return [
    accuracy,
    daysSinceNorm,
    difficultyNorm,
    attemptsNorm,
    efNorm,
    intervalNorm,
    catFamiliarity,
    timeOfDay
  ];
}

// Create and compile model
async function createModel() {
  const tf = getTensorFlow();

  const newModel = tf.sequential();

  // Input layer
  newModel.add(tf.layers.dense({
    units: 16,
    activation: 'relu',
    inputShape: [8]
  }));

  // Hidden layer
  newModel.add(tf.layers.dense({
    units: 8,
    activation: 'relu'
  }));

  // Dropout for regularization
  newModel.add(tf.layers.dropout({ rate: 0.2 }));

  // Output layer (probability of failure)
  newModel.add(tf.layers.dense({
    units: 1,
    activation: 'sigmoid'
  }));

  newModel.compile({
    optimizer: tf.train.adam(0.01),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy']
  });

  return newModel;
}

// Initialize the prediction model
export async function initPredictionModel() {
  if (isModelReady && model) {
    return true;
  }

  try {
    await loadTensorFlow();
    const tf = getTensorFlow();

    // Try to load saved model
    const savedModel = await get(STORES.ML_MODEL, 'prediction-model');

    if (savedModel && savedModel.weights) {
      model = await createModel();
      const weights = savedModel.weights.map(w => tf.tensor(w.values, w.shape));
      model.setWeights(weights);
      console.log('Loaded saved prediction model');
    } else {
      model = await createModel();
      console.log('Created new prediction model');
    }

    isModelReady = true;
    return true;
  } catch (error) {
    console.error('Failed to initialize prediction model:', error);
    return false;
  }
}

// Save model to IndexedDB
async function saveModel() {
  if (!model || !isModelReady) return;

  try {
    const tf = getTensorFlow();
    const weights = model.getWeights().map(w => ({
      values: Array.from(w.dataSync()),
      shape: w.shape
    }));

    await put(STORES.ML_MODEL, {
      key: 'prediction-model',
      weights,
      savedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to save model:', error);
  }
}

// Train model with new data
export async function trainModel(trainingData) {
  if (!isModelReady || !model) {
    await initPredictionModel();
  }

  if (!model || trainingData.length < 10) {
    return false;
  }

  try {
    const tf = getTensorFlow();

    const xs = tf.tensor2d(trainingData.map(d => d.features));
    const ys = tf.tensor2d(trainingData.map(d => [d.failed ? 1 : 0]));

    await model.fit(xs, ys, {
      epochs: 10,
      batchSize: Math.min(32, trainingData.length),
      shuffle: true,
      verbose: 0
    });

    xs.dispose();
    ys.dispose();

    await saveModel();
    return true;
  } catch (error) {
    console.error('Training failed:', error);
    return false;
  }
}

// Predict failure probability for a sign
export async function predictFailure(signProgress, signData, categoryStats) {
  if (!isModelReady || !model) {
    return 0.5; // Default uncertainty
  }

  try {
    const tf = getTensorFlow();
    const features = extractFeatures(signProgress, signData, categoryStats);
    const input = tf.tensor2d([features]);
    const prediction = model.predict(input);
    const probability = (await prediction.data())[0];

    input.dispose();
    prediction.dispose();

    return probability;
  } catch (error) {
    console.error('Prediction failed:', error);
    return 0.5;
  }
}

// Get signs most likely to be failed
export async function getMostLikelyToFail(signData, limit = 10) {
  if (!isModelReady) {
    await initPredictionModel();
  }

  const allProgress = await getAll(STORES.SIGN_PROGRESS);
  const categoryStats = await getAll(STORES.CATEGORY_STATS);
  const catStatsMap = categoryStats.reduce((acc, s) => {
    acc[s.categoryKey] = s;
    return acc;
  }, {});

  const predictions = [];

  for (const progress of allProgress) {
    // Find sign data
    let signInfo = null;
    for (const [catKey, cat] of Object.entries(signData)) {
      const sign = cat.signs.find(s => s.id === progress.signId);
      if (sign) {
        signInfo = { ...sign, category: catKey, categoryName: cat.name };
        break;
      }
    }

    if (!signInfo) continue;

    const failProbability = await predictFailure(progress, signInfo, catStatsMap);

    predictions.push({
      signId: progress.signId,
      name: signInfo.name,
      img: signInfo.img,
      category: signInfo.category,
      categoryName: signInfo.categoryName,
      failProbability,
      accuracy: progress.correctAttempts / progress.totalAttempts
    });
  }

  // Sort by failure probability (highest first)
  predictions.sort((a, b) => b.failProbability - a.failProbability);

  return predictions.slice(0, limit);
}

// Collect training data from quiz results
export function collectTrainingData(quizResults, signData, categoryStats) {
  const trainingData = [];

  quizResults.forEach(result => {
    const signProgress = result.progress;
    const sign = result.sign;

    if (!signProgress || !sign) return;

    const features = extractFeatures(signProgress, sign, categoryStats);

    trainingData.push({
      features,
      failed: !result.isCorrect
    });
  });

  return trainingData;
}

// Update model with quiz session data
export async function updateModelWithSession(sessionResults, signData) {
  const categoryStats = await getAll(STORES.CATEGORY_STATS);
  const catStatsMap = categoryStats.reduce((acc, s) => {
    acc[s.categoryKey] = s;
    return acc;
  }, {});

  const trainingData = collectTrainingData(sessionResults, signData, catStatsMap);

  if (trainingData.length >= 5) {
    await trainModel(trainingData);
  }
}

// Check if model is ready
export function isModelInitialized() {
  return isModelReady;
}

// Get model info
export async function getModelInfo() {
  const savedModel = await get(STORES.ML_MODEL, 'prediction-model');

  return {
    initialized: isModelReady,
    hasSavedWeights: !!savedModel,
    lastSaved: savedModel?.savedAt || null
  };
}
