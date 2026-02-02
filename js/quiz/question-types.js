// Question type definitions and generators

import { state } from '../state.js';

export const QuestionType = {
  IMAGE_TO_TEXT: 'image-to-text',
  TEXT_TO_IMAGE: 'text-to-image'
};

// Shuffle array using Fisher-Yates
export function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Generate options for a question
function generateOptions(correctSign, allSigns, count = 4) {
  const filtered = allSigns.filter(s => s.id !== correctSign.id);
  const wrongOptions = shuffleArray(filtered).slice(0, count - 1);
  const options = [...wrongOptions, correctSign];
  return state.shuffleOptions ? shuffleArray(options) : options;
}

// Generate Image-to-Text question
export function generateImageToTextQuestion(sign, allSigns) {
  const options = generateOptions(sign, allSigns);

  return {
    type: QuestionType.IMAGE_TO_TEXT,
    sign,
    prompt: 'Vad betyder detta vägmärke?',
    image: sign.img,
    options: options.map(opt => ({
      id: opt.id,
      name: opt.name,
      isCorrect: opt.id === sign.id
    })),
    correctAnswer: sign.name,
    startTime: Date.now()
  };
}

// Generate Text-to-Image question
export function generateTextToImageQuestion(sign, allSigns) {
  const options = generateOptions(sign, allSigns);

  return {
    type: QuestionType.TEXT_TO_IMAGE,
    sign,
    prompt: sign.name,
    description: `Vilket vägmärke visar "${sign.name}"?`,
    options: options.map(opt => ({
      id: opt.id,
      name: opt.name,
      img: opt.img,
      isCorrect: opt.id === sign.id
    })),
    correctAnswer: sign.id,
    correctImage: sign.img,
    startTime: Date.now()
  };
}

// Generate question based on current settings
export function generateQuestion(sign, allSigns) {
  const type = state.questionType;

  if (type === 'mixed') {
    // 50/50 chance for each type
    return Math.random() < 0.5
      ? generateImageToTextQuestion(sign, allSigns)
      : generateTextToImageQuestion(sign, allSigns);
  }

  if (type === QuestionType.TEXT_TO_IMAGE) {
    return generateTextToImageQuestion(sign, allSigns);
  }

  return generateImageToTextQuestion(sign, allSigns);
}

// Filter signs by difficulty
export function filterByDifficulty(signs, difficulty) {
  if (difficulty === 'adaptive') {
    return signs; // Handled separately by adaptive algorithm
  }

  const difficultyMap = {
    easy: [1, 2],
    medium: [2, 3, 4],
    hard: [3, 4, 5]
  };

  const allowedDifficulties = difficultyMap[difficulty] || [1, 2, 3, 4, 5];

  return signs.filter(sign => {
    const signDifficulty = sign.difficulty || 2;
    return allowedDifficulties.includes(signDifficulty);
  });
}

// Get similar signs for harder questions (signs that are commonly confused)
export function getSimilarSigns(sign, allSigns) {
  // Group signs by first letter of their name or by category
  const category = sign.category;
  const sameCategorySigns = allSigns.filter(s =>
    s.category === category && s.id !== sign.id
  );

  if (sameCategorySigns.length >= 3) {
    return sameCategorySigns;
  }

  // Fall back to all signs
  return allSigns.filter(s => s.id !== sign.id);
}

// Generate a harder question with similar options
export function generateHardQuestion(sign, allSigns) {
  const similarSigns = getSimilarSigns(sign, allSigns);
  const wrongOptions = shuffleArray(similarSigns).slice(0, 3);
  const options = state.shuffleOptions
    ? shuffleArray([...wrongOptions, sign])
    : [...wrongOptions, sign];

  const type = state.questionType === 'mixed'
    ? (Math.random() < 0.5 ? QuestionType.IMAGE_TO_TEXT : QuestionType.TEXT_TO_IMAGE)
    : state.questionType;

  if (type === QuestionType.TEXT_TO_IMAGE) {
    return {
      type: QuestionType.TEXT_TO_IMAGE,
      sign,
      prompt: sign.name,
      description: `Vilket vägmärke visar "${sign.name}"?`,
      options: options.map(opt => ({
        id: opt.id,
        name: opt.name,
        img: opt.img,
        isCorrect: opt.id === sign.id
      })),
      correctAnswer: sign.id,
      correctImage: sign.img,
      isHard: true,
      startTime: Date.now()
    };
  }

  return {
    type: QuestionType.IMAGE_TO_TEXT,
    sign,
    prompt: 'Vad betyder detta vägmärke?',
    image: sign.img,
    options: options.map(opt => ({
      id: opt.id,
      name: opt.name,
      isCorrect: opt.id === sign.id
    })),
    correctAnswer: sign.name,
    isHard: true,
    startTime: Date.now()
  };
}
