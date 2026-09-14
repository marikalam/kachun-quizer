import { createWorker } from 'tesseract.js';

export async function recognizeText(imageSource, onProgress) {
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress(m.progress);
      }
    },
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(imageSource);
    return text;
  } finally {
    await worker.terminate();
  }
}
