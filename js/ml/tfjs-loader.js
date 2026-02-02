// Lazy loader for TensorFlow.js

let tf = null;
let loadPromise = null;
let isLoaded = false;

const TFJS_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js';

export function isTensorFlowLoaded() {
  return isLoaded;
}

export async function loadTensorFlow() {
  if (isLoaded && tf) {
    return tf;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    // Check if already loaded globally
    if (window.tf) {
      tf = window.tf;
      isLoaded = true;
      resolve(tf);
      return;
    }

    const script = document.createElement('script');
    script.src = TFJS_CDN;
    script.async = true;

    script.onload = () => {
      tf = window.tf;
      isLoaded = true;
      console.log('TensorFlow.js loaded successfully');
      resolve(tf);
    };

    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load TensorFlow.js'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

export function getTensorFlow() {
  return tf;
}

// Dispose of TensorFlow resources
export function disposeTensorFlow() {
  if (tf) {
    tf.disposeVariables();
  }
}
