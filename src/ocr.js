import { createWorker } from 'tesseract.js';

function preprocessImage(imageSource) {
  // Create a canvas to process the image
  const canvas = document.createElement('canvas');
  const img = new Image();

  return new Promise((resolve) => {
    img.onload = () => {
      // Set canvas size with higher resolution for better OCR
      canvas.width = Math.max(img.width, 1200);
      canvas.height = Math.max(img.height, 800);

      const ctx = canvas.getContext('2d');

      // Draw image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Enhance contrast and convert to grayscale
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Convert to grayscale
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

        // Enhance contrast
        const enhanced = gray < 128 ? Math.max(0, gray - 30) : Math.min(255, gray + 30);

        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas);
    };

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
      img.src = URL.createObjectURL(imageSource);
    }
  });
}

export async function recognizeText(imageSource, onProgress) {
  try {
    // Preprocess the image for better recognition
    const processedCanvas = await preprocessImage(imageSource);

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
      } = await worker.recognize(processedCanvas);
      return text;
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    console.error('[OCR] Recognition failed:', err);
    throw new Error('Could not read text from image. Try a clearer photo with better lighting.');
  }
}
