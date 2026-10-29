import QRCode from 'qrcode';
import type { QrStandeeTheme } from '../types/review';

export interface PrintableQrPosterInput {
  businessName: string;
  category: string;
  locationLabel?: string;
  customerReviewUrl: string;
  theme?: QrStandeeTheme;
}

interface StandeePalette {
  bg: string;
  frameBorder: string;
  topAccent: string;
  titleColor: string;
  subColor: string;
  dividerColor: string;
  qrFrameBg: string;
  qrFrameStroke: string;
  qrDark: string;
  starColor: string;
  footerText: string;
  mutedUrl: string;
}

const PALETTES: Record<QrStandeeTheme, StandeePalette> = {
  classic: {
    bg: '#ffffff',
    frameBorder: '#cbd5e1',
    topAccent: '#4f46e5',
    titleColor: '#0f172a',
    subColor: '#475569',
    dividerColor: '#e2e8f0',
    qrFrameBg: '#ffffff',
    qrFrameStroke: '#cbd5e1',
    qrDark: '#0f172a',
    starColor: '#f59e0b',
    footerText: '#0f172a',
    mutedUrl: '#64748b',
  },
  navy: {
    bg: '#0f172a',
    frameBorder: '#334155',
    topAccent: '#6366f1',
    titleColor: '#f8fafc',
    subColor: '#cbd5e1',
    dividerColor: '#1e293b',
    qrFrameBg: '#ffffff',
    qrFrameStroke: '#6366f1',
    qrDark: '#0f172a',
    starColor: '#fbbf24',
    footerText: '#f1f5f9',
    mutedUrl: '#94a3b8',
  },
  gold: {
    bg: '#fffbeb',
    frameBorder: '#fde68a',
    topAccent: '#d97706',
    titleColor: '#0f172a',
    subColor: '#57534e',
    dividerColor: '#fde68a',
    qrFrameBg: '#ffffff',
    qrFrameStroke: '#f59e0b',
    qrDark: '#0f172a',
    starColor: '#d97706',
    footerText: '#1c1917',
    mutedUrl: '#78716c',
  },
};

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number,
  fillStyle: string
) {
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

/**
 * Generates a print-ready high-resolution (1200x1600) Shop Counter QR Standee PNG
 * ready for acrylic shop stands, billing counters, wall stickers, or table tents.
 */
export async function generatePrintableQrCardDataUrl(
  input: PrintableQrPosterInput
): Promise<string> {
  const width = 1200;
  const height = 1600;
  const palette = PALETTES[input.theme ?? 'classic'];

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  // Standee background
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);

  // Outer trim border
  ctx.strokeStyle = palette.frameBorder;
  ctx.lineWidth = 6;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  // Top accent bar
  ctx.fillStyle = palette.topAccent;
  ctx.fillRect(36, 36, width - 72, 22);

  // Business Name
  ctx.fillStyle = palette.titleColor;
  ctx.textAlign = 'center';
  ctx.font = 'bold 58px "Plus Jakarta Sans", system-ui, sans-serif';
  const truncatedName =
    input.businessName.length > 28 ? `${input.businessName.slice(0, 27)}…` : input.businessName;
  ctx.fillText(truncatedName, width / 2, 175);

  // Category & Location subtitle
  ctx.fillStyle = palette.subColor;
  ctx.font = '500 28px "DM Sans", system-ui, sans-serif';
  const metaParts = [input.category, input.locationLabel].filter(Boolean).join(' · ');
  ctx.fillText(metaParts.slice(0, 56), width / 2, 228);

  // 5 Golden Stars Row
  const starSpacing = 74;
  const startStarX = width / 2 - starSpacing * 2;
  for (let i = 0; i < 5; i++) {
    drawStar(ctx, startStarX + i * starSpacing, 292, 5, 24, 11, palette.starColor);
  }

  // Divider
  ctx.strokeStyle = palette.dividerColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(180, 348);
  ctx.lineTo(width - 180, 348);
  ctx.stroke();

  // Headline instruction
  ctx.fillStyle = palette.titleColor;
  ctx.font = 'bold 44px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Scan to Write a Google Review in 10s', width / 2, 422);

  ctx.fillStyle = palette.subColor;
  ctx.font = '500 27px "DM Sans", system-ui, sans-serif';
  ctx.fillText('AI writes your words · English, हिन्दी & Hinglish', width / 2, 472);

  // Render QR Code onto an offscreen canvas
  const qrSize = 680;
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, input.customerReviewUrl, {
    width: qrSize,
    margin: 2,
    color: {
      dark: palette.qrDark,
      light: '#ffffff',
    },
    errorCorrectionLevel: 'H',
  });

  // White QR pad + crisp border
  const qrX = (width - qrSize) / 2;
  const qrY = 530;
  ctx.fillStyle = palette.qrFrameBg;
  ctx.fillRect(qrX - 24, qrY - 24, qrSize + 48, qrSize + 48);
  ctx.strokeStyle = palette.qrFrameStroke;
  ctx.lineWidth = 4;
  ctx.strokeRect(qrX - 24, qrY - 24, qrSize + 48, qrSize + 48);
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  // Steps footer
  ctx.fillStyle = palette.footerText;
  ctx.font = '600 28px "DM Sans", system-ui, sans-serif';
  ctx.fillText('1. Scan QR   ·   2. Pick Stars & Edit AI Draft   ·   3. Post on Google', width / 2, 1320);

  // Encoded URL
  ctx.fillStyle = palette.mutedUrl;
  ctx.font = '400 22px "JetBrains Mono", monospace';
  const displayUrl =
    input.customerReviewUrl.length > 62
      ? `${input.customerReviewUrl.slice(0, 60)}…`
      : input.customerReviewUrl;
  ctx.fillText(displayUrl, width / 2, 1392);

  ctx.fillStyle = palette.mutedUrl;
  ctx.font = '600 23px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Powered by ReviewEase AI · Official Shop Scanner', width / 2, 1475);

  return canvas.toDataURL('image/png');
}
