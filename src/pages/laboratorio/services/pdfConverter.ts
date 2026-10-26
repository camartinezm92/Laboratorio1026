import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker using a reliable CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export async function convertPdfToImage(pdfBase64: string): Promise<string> {
  try {
    // Remove data:application/pdf;base64, if present
    const base64Data = pdfBase64.includes('base64,') 
      ? pdfBase64.split('base64,')[1] 
      : pdfBase64;
    
    const binaryData = atob(base64Data);
    const uint8Array = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      uint8Array[i] = binaryData.charCodeAt(i);
    }

    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    
    // Get the first page
    const page = await pdf.getPage(1);
    
    const viewport = page.getViewport({ scale: 2.0 }); // High quality
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Could not create canvas context');
    }
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const renderContext: any = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    // Convert to JPEG with compression to stay under Firestore 1MB limit
    // 0.7 quality is usually a good balance between readability and size
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch (error) {
    console.error('Error converting PDF to image:', error);
    throw new Error('No se pudo convertir el PDF a imagen para el reporte.');
  }
}
