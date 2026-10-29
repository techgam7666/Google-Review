import QRCode from 'qrcode';

export interface PrintableQrPosterInput {
  businessName: string;
  category: string;
  locationLabel?: string;
  customerReviewUrl: string;
}

/**
 * Generates a print-ready high-resolution (1200x1500) tabletop QR card PNG
 * suitable for acrylic counter stands, table tents, or checkout counters.
 */
export async function generatePrintableQrCardDataUrl(
  input: PrintableQrPosterInput
): Promise<string> {
  const width = 1200;
  const height = 1520;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  // Crisp white background with subtle slate border frame
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 6;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  // Top indigo accent bar
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(36, 36, width - 72, 18);

  // Business Name
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 58px "Plus Jakarta Sans", system-ui, sans-serif';
  const truncatedName =
    input.businessName.length > 28 ? `${input.businessName.slice(0, 27)}…` : input.businessName;
  ctx.fillText(truncatedName, width / 2, 185);

  // Category & Location subtitle
  ctx.fillStyle = '#475569';
  ctx.font = '500 28px "DM Sans", system-ui, sans-serif';
  const metaParts = [input.category, input.locationLabel].filter(Boolean).join(' · ');
  ctx.fillText(metaParts.slice(0, 56), width / 2, 240);

  // Divider
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(220, 290);
  ctx.lineTo(width - 220, 290);
  ctx.stroke();

  // Headline instruction
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 42px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Share your Google review in seconds', width / 2, 375);

  ctx.fillStyle = '#64748b';
  ctx.font = '400 28px "DM Sans", system-ui, sans-serif';
  ctx.fillText('Scan with your phone camera · English, हिन्दी & Hinglish', width / 2, 425);

  // Render QR Code onto an offscreen canvas
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, input.customerReviewUrl, {
    width: 680,
    margin: 2,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'H',
  });

  // Draw QR frame
  const qrX = (width - 680) / 2;
  const qrY = 480;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.strokeRect(qrX - 16, qrY - 16, 712, 712);
  ctx.drawImage(qrCanvas, qrX, qrY, 680, 680);

  // Steps footer
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 27px "DM Sans", system-ui, sans-serif';
  ctx.fillText('1. Scan QR   ·   2. Pick stars & edit draft   ·   3. Paste on Google', width / 2, 1295);

  // Encoded URL + Powered by ReviewEase AI
  ctx.fillStyle = '#64748b';
  ctx.font = '400 22px "JetBrains Mono", monospace';
  const displayUrl =
    input.customerReviewUrl.length > 62
      ? `${input.customerReviewUrl.slice(0, 60)}…`
      : input.customerReviewUrl;
  ctx.fillText(displayUrl, width / 2, 1365);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Powered by ReviewEase AI', width / 2, 1430);

  return canvas.toDataURL('image/png');
}
