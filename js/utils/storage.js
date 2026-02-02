// IndexedDB storage layer for persistent data

const DB_NAME = 'vagmarkesforhor-db';
const DB_VERSION = 1;

let db = null;

const STORES = {
  SIGN_PROGRESS: 'signProgress',
  QUIZ_SESSIONS: 'quizSessions',
  CATEGORY_STATS: 'categoryStats',
  ML_MODEL: 'mlModelData'
};

export { STORES };

export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Sign progress store - tracks learning progress per sign
      if (!database.objectStoreNames.contains(STORES.SIGN_PROGRESS)) {
        const signStore = database.createObjectStore(STORES.SIGN_PROGRESS, { keyPath: 'signId' });
        signStore.createIndex('nextReviewDate', 'nextReviewDate', { unique: false });
        signStore.createIndex('category', 'category', { unique: false });
      }

      // Quiz sessions store - history of quiz attempts
      if (!database.objectStoreNames.contains(STORES.QUIZ_SESSIONS)) {
        const sessionStore = database.createObjectStore(STORES.QUIZ_SESSIONS, { keyPath: 'id', autoIncrement: true });
        sessionStore.createIndex('date', 'date', { unique: false });
      }

      // Category stats store - aggregated stats per category
      if (!database.objectStoreNames.contains(STORES.CATEGORY_STATS)) {
        database.createObjectStore(STORES.CATEGORY_STATS, { keyPath: 'categoryKey' });
      }

      // ML model data store
      if (!database.objectStoreNames.contains(STORES.ML_MODEL)) {
        database.createObjectStore(STORES.ML_MODEL, { keyPath: 'key' });
      }
    };
  });
}

export async function getDB() {
  if (!db) {
    await initDB();
  }
  return db;
}

// Generic CRUD operations
export async function put(storeName, data) {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function get(storeName, key) {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteRecord(storeName, key) {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearStore(storeName) {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Sign progress specific operations
export async function getSignProgress(signId) {
  return get(STORES.SIGN_PROGRESS, signId);
}

export async function updateSignProgress(signId, category, isCorrect, responseTime) {
  let progress = await getSignProgress(signId);

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
      averageResponseTime: 0
    };
  }

  progress.totalAttempts++;
  progress.lastAttemptDate = new Date().toISOString();

  // Update average response time
  const prevTotal = progress.averageResponseTime * (progress.totalAttempts - 1);
  progress.averageResponseTime = (prevTotal + responseTime) / progress.totalAttempts;

  if (isCorrect) {
    progress.correctAttempts++;
  }

  await put(STORES.SIGN_PROGRESS, progress);
  return progress;
}

export async function getDueForReview(limit = 20) {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORES.SIGN_PROGRESS, 'readonly');
    const store = tx.objectStore(STORES.SIGN_PROGRESS);
    const index = store.index('nextReviewDate');
    const now = new Date().toISOString();
    const range = IDBKeyRange.upperBound(now);
    const request = index.getAll(range, limit);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getWeakestSigns(limit = 10) {
  const allProgress = await getAll(STORES.SIGN_PROGRESS);
  return allProgress
    .filter(p => p.totalAttempts >= 2)
    .sort((a, b) => {
      const aAccuracy = a.correctAttempts / a.totalAttempts;
      const bAccuracy = b.correctAttempts / b.totalAttempts;
      return aAccuracy - bAccuracy;
    })
    .slice(0, limit);
}

// Quiz session operations
export async function saveQuizSession(session) {
  return put(STORES.QUIZ_SESSIONS, {
    ...session,
    date: new Date().toISOString()
  });
}

export async function getQuizSessions(limit = 50) {
  const all = await getAll(STORES.QUIZ_SESSIONS);
  return all
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
}

// Category stats operations
export async function updateCategoryStats(categoryKey, correct, total) {
  let stats = await get(STORES.CATEGORY_STATS, categoryKey);

  if (!stats) {
    stats = {
      categoryKey,
      totalAttempts: 0,
      correctAttempts: 0,
      lastPracticed: null
    };
  }

  stats.totalAttempts += total;
  stats.correctAttempts += correct;
  stats.lastPracticed = new Date().toISOString();

  await put(STORES.CATEGORY_STATS, stats);
  return stats;
}

export async function getCategoryStats() {
  return getAll(STORES.CATEGORY_STATS);
}

// Dashboard statistics
export async function getDashboardStats() {
  const [signProgress, sessions, categoryStats] = await Promise.all([
    getAll(STORES.SIGN_PROGRESS),
    getQuizSessions(100),
    getCategoryStats()
  ]);

  const totalSigns = signProgress.length;
  const masteredSigns = signProgress.filter(p =>
    p.totalAttempts >= 3 && (p.correctAttempts / p.totalAttempts) >= 0.8
  ).length;

  const totalAttempts = signProgress.reduce((sum, p) => sum + p.totalAttempts, 0);
  const correctAttempts = signProgress.reduce((sum, p) => sum + p.correctAttempts, 0);
  const overallAccuracy = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;

  // Calculate streak
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  let currentStreak = 0;

  const sessionDates = [...new Set(sessions.map(s => new Date(s.date).toDateString()))];
  sessionDates.sort((a, b) => new Date(b) - new Date(a));

  if (sessionDates[0] === today || sessionDates[0] === yesterday) {
    for (let i = 0; i < sessionDates.length; i++) {
      const expected = new Date(Date.now() - i * 86400000).toDateString();
      if (sessionDates[i] === expected) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return {
    totalSigns,
    masteredSigns,
    overallAccuracy,
    currentStreak,
    totalQuizzes: sessions.length,
    categoryStats: categoryStats.reduce((acc, stat) => {
      acc[stat.categoryKey] = stat;
      return acc;
    }, {})
  };
}
