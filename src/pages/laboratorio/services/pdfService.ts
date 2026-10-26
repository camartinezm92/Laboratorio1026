import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LabResultData, getCategory } from '../types';
import { PROFESSIONALS } from '../../../constants';
import { formatColombia } from '../../../utils/dateUtils';

// Helper to load image
const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (reject);
    img.src = url;
  });
};

export const generatePdf = async (result: LabResultData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 15;
  
  // 1. Header: Company Info (Left) and Logo (Right)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Medicina Intensiva del Tolima', 14, currentY);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Dirección: Calle 9 No. 22 A - 193', 14, currentY + 5);
  doc.text('Telefonos (8) 2517771 - (8) 2511666 FAX (8) 2515771', 14, currentY + 9);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Resultados de Laboratorio Clinico', 14, currentY + 15);

  try {
    const logoImg = await loadImage('/logo.png');
    const logoProps = doc.getImageProperties(logoImg);
    const logoHeight = 15; // Fixed height to match header text
    const logoWidth = (logoProps.width * logoHeight) / logoProps.height;
    doc.addImage(logoImg, 'PNG', pageWidth - logoWidth - 14, 12, logoWidth, logoHeight);
  } catch (e) {
    console.error('Error loading logo for PDF', e);
  }

  currentY += 25;

  // 2. Patient Info Section
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  
  const leftColX = 14;
  const rightColX = pageWidth / 2 + 10;
  const labelWidth = 32; // Increased to prevent overlap

  const drawInfoLine = (label: string, value: string, x: number, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}`, x, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`:  ${value}`, x + labelWidth, y);
  };

  drawInfoLine('Solicitud', result.solicitudNumber || result.id.substring(0, 8).toUpperCase(), leftColX, currentY);
  drawInfoLine('Fecha Recepción', result.receptionDate ? formatColombia(result.receptionDate).split(' ')[0] : formatColombia(result.date), rightColX, currentY);
  currentY += 4;

  drawInfoLine('Paciente', result.patientName.toUpperCase(), leftColX, currentY);
  drawInfoLine('Fecha Impresión', formatColombia(new Date()), rightColX, currentY);
  currentY += 4;

  drawInfoLine('Identificación', result.clinicalHistoryNumber || 'N/A', leftColX, currentY);
  drawInfoLine('Fecha Toma Muestra', result.sampleDate ? formatColombia(result.sampleDate).split(' ')[0] : formatColombia(result.date).split(' ')[0], rightColX, currentY);
  currentY += 4;

  drawInfoLine('EPS', result.eps || 'PARTICULAR', leftColX, currentY);
  currentY += 4;

  drawInfoLine('Edad', result.age || 'N/A', leftColX, currentY);
  currentY += 4;

  drawInfoLine('Tipo de Estudio', result.studyType.toUpperCase(), leftColX, currentY);
  
  currentY += 8;

  // 3. Results Tables grouped by category
  const groupedParameters = result.parameters.reduce((acc, p) => {
    const category = p.category || getCategory(p.name);
    if (!acc[category]) acc[category] = [];
    acc[category].push(p);
    return acc;
  }, {} as Record<string, typeof result.parameters>);

  // Define categories to show (keeping order if possible)
  const categoryOrder = ['Hematología', 'Química sanguínea', 'Otros'];
  const categoriesPresent = Object.keys(groupedParameters).sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  for (const category of categoriesPresent) {
    const params = groupedParameters[category];
    if (params.length === 0) continue;

    // Check for page break before category title
    if (currentY > 260) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(category.toUpperCase(), 14, currentY);
    currentY += 2;

    const tableData = params.map(p => {
      const isOutOfRange = p.status === 'Alto' || p.status === 'Bajo';
      const displayValue = isOutOfRange ? `${p.value} *` : p.value;
      return [
        p.name.toUpperCase(),
        `${displayValue} ${p.unit}`,
        p.referenceRange,
        p.status === 'Normal' ? '' : p.status.toUpperCase()
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['ANALISIS', 'RESULTADO', 'REFERENCIA O RANGO', 'ESTADO']],
      body: tableData,
      theme: 'plain',
      headStyles: { 
        fillColor: [255, 255, 255], 
        textColor: [0, 0, 0], 
        fontStyle: 'bold',
        lineWidth: { bottom: 0.1 },
        lineColor: [100, 100, 100],
        fontSize: 8
      },
      styles: { 
        fontSize: 7,
        cellPadding: 1.5,
        textColor: [0, 0, 0]
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 35 },
        2: { cellWidth: 55 },
        3: { cellWidth: 30, fontStyle: 'bold' }
      },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 1) {
          const value = data.cell.raw as string;
          if (value.includes('*')) {
            data.cell.styles.fontStyle = 'bold';
          }
        }
        if (data.section === 'body' && data.column.index === 3) {
          const status = data.cell.raw as string;
          if (status === 'ALTO') data.cell.styles.textColor = [220, 38, 38];
          if (status === 'BAJO') data.cell.styles.textColor = [217, 119, 6];
        }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // 4. Validation and Signature
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Fecha Validación: ${formatColombia(new Date())}`, 14, currentY);
  
  currentY += 12; // Small space before signature block

  const professional = PROFESSIONALS.find(p => p.name === result.bacteriologist) || PROFESSIONALS[0];
  const sigX = 14; 
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Validado Por:', sigX, currentY - 8);

  try {
    const signature = await loadImage(professional.signaturePath);
    const sigHeight = 10; // Fixed height for consistency
    const sigWidth = (signature.width * sigHeight) / signature.height;
    
    if (currentY + sigHeight > 280) {
      doc.addPage();
      currentY = 30;
    }

    doc.addImage(signature, 'PNG', sigX, currentY - 6, sigWidth, sigHeight);
    currentY += sigHeight + 2;
  } catch (e) {
    console.error('Error loading signature:', e);
    currentY += 8;
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(professional.name.toUpperCase(), sigX, currentY);
  currentY += 3;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Reg. Prof. ${professional.registry}`, sigX, currentY);

  // 5. Footer
  const footerY = 285;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('* La interpretación del resultado de sus examenes corresponde exclusivamente al médico *', pageWidth / 2, footerY, { align: 'center' });

  // 6. Second Page: Original Document
  if (result.sourceImage) {
    doc.addPage();
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Documento Original Adjunto (Scanner)', 14, 20);
    
    try {
      const sourceImage = result.sourceImage;
      let format = 'JPEG';
      if (sourceImage.startsWith('data:image/png')) format = 'PNG';
      if (sourceImage.startsWith('data:image/webp')) format = 'WEBP';
      
      const imgProps = doc.getImageProperties(sourceImage);
      const pdfWidth = pageWidth - 28;
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      const maxPdfHeight = doc.internal.pageSize.getHeight() - 40;
      let finalWidth = pdfWidth;
      let finalHeight = pdfHeight;
      
      if (pdfHeight > maxPdfHeight) {
        finalHeight = maxPdfHeight;
        finalWidth = (imgProps.width * finalHeight) / imgProps.height;
      }
      
      const xOffset = (pageWidth - finalWidth) / 2;
      doc.addImage(sourceImage, format, xOffset, 30, finalWidth, finalHeight);
    } catch (e) {
      console.error('Error adding source image to PDF', e);
    }
  }

  const dateStr = formatColombia(result.date).split(' ')[0].replace(/\//g, '-');
  const safePatientName = result.patientName.replace(/\s+/g, '_');
  doc.save(`${dateStr}_Resultado_Laboratorio_${safePatientName}.pdf`);
};

export const generateJson = (result: LabResultData) => {
  const dateStr = formatColombia(result.date).split(' ')[0].replace(/\//g, '-');
  const safePatientName = result.patientName.replace(/\s+/g, '_');
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href",     dataStr);
  downloadAnchorNode.setAttribute("download", `${dateStr}_Resultado_Laboratorio_${safePatientName}.json`);
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
};
