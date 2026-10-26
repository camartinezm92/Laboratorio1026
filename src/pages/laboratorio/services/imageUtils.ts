/**
 * Compresses an image data URL to a JPEG with a specific quality to stay under Firestore 1MB limit.
 */
export async function compressImage(dataUrl: string, maxWidth = 1600, initialQuality = 0.7): Promise<{ base64: string, mimeType: string, fullDataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Scale down if too large
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      // Also limit height to prevent extremely long images from exceeding size limits
      const maxHeight = 2400;
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Iteratively compress to ensure it's under ~500KB (to leave room for other document fields and metadata)
      // 500KB in base64 is roughly 500 * 1024 * 1.33 = ~680,000 characters
      const MAX_BASE64_LENGTH = 650000; 
      let quality = initialQuality;
      let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      
      while (compressedDataUrl.length > MAX_BASE64_LENGTH && quality > 0.1) {
        quality -= 0.1;
        compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      
      // If still too large, scale down the image dimensions further
      if (compressedDataUrl.length > MAX_BASE64_LENGTH) {
        let scale = 0.8;
        while (compressedDataUrl.length > MAX_BASE64_LENGTH && scale > 0.3) {
          canvas.width = width * scale;
          canvas.height = height * scale;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          compressedDataUrl = canvas.toDataURL('image/jpeg', 0.5);
          scale -= 0.2;
        }
      }

      const [header, base64] = compressedDataUrl.split('base64,');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';

      resolve({
        base64,
        mimeType,
        fullDataUrl: compressedDataUrl
      });
    };
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}
