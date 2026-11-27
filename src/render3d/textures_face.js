import { THREE } from './shared.js';

function drawEyeIris(c2d, cx, cy, irisHexCss, irisGlowCss) {
  c2d.beginPath();
  c2d.ellipse(cx, cy, 56, 68, 0, 0, Math.PI * 2);
  c2d.fillStyle = '#ffffff';
  c2d.fill();

  c2d.save();
  c2d.clip();
  c2d.fillStyle = 'rgba(148, 163, 184, 0.25)';
  c2d.fillRect(cx - 60, cy - 70, 120, 32);

  const irisGrad = c2d.createLinearGradient(cx, cy - 48, cx, cy + 56);
  irisGrad.addColorStop(0, '#0f172a');
  irisGrad.addColorStop(0.42, irisHexCss);
  irisGrad.addColorStop(1, irisGlowCss);

  c2d.beginPath();
  c2d.ellipse(cx, cy + 5, 41, 55, 0, 0, Math.PI * 2);
  c2d.fillStyle = irisGrad;
  c2d.fill();

  c2d.beginPath();
  c2d.ellipse(cx, cy + 12, 29, 36, 0, 0.1 * Math.PI, 0.9 * Math.PI);
  c2d.lineWidth = 4;
  c2d.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  c2d.stroke();

  c2d.beginPath();
  c2d.ellipse(cx, cy + 8, 16, 23, 0, 0, Math.PI * 2);
  c2d.fillStyle = '#090d16';
  c2d.fill();

  c2d.beginPath();
  c2d.ellipse(cx - 16, cy - 19, 15, 19, -0.25, 0, Math.PI * 2);
  c2d.fillStyle = '#ffffff';
  c2d.fill();

  c2d.beginPath();
  c2d.arc(cx + 17, cy + 25, 8.5, 0, Math.PI * 2);
  c2d.fillStyle = '#ffffff';
  c2d.fill();

  c2d.beginPath();
  c2d.arc(cx + 18, cy - 22, 4.5, 0, Math.PI * 2);
  c2d.fillStyle = '#ffffff';
  c2d.fill();
  c2d.restore();
}

function drawEyeLashesAndBrow(c2d, cx, cy, isLeft, browHexCss) {
  const wingDir = isLeft ? -1 : 1;
  c2d.beginPath();
  c2d.arc(cx, cy - 4, 60, Math.PI * 1.07, Math.PI * 1.93);
  c2d.lineWidth = 17;
  c2d.lineCap = 'round';
  c2d.strokeStyle = '#0f1020';
  c2d.stroke();

  c2d.beginPath();
  c2d.moveTo(cx + wingDir * 52, cy - 22);
  c2d.quadraticCurveTo(cx + wingDir * 72, cy - 30, cx + wingDir * 78, cy - 44);
  c2d.lineWidth = 10;
  c2d.lineCap = 'round';
  c2d.strokeStyle = '#0f1020';
  c2d.stroke();

  c2d.beginPath();
  c2d.arc(cx, cy + 8, 52, Math.PI * 0.22, Math.PI * 0.78);
  c2d.lineWidth = 4;
  c2d.strokeStyle = '#334155';
  c2d.stroke();

  c2d.beginPath();
  c2d.arc(cx, cy - 16, 62, Math.PI * 1.18, Math.PI * 1.82);
  c2d.lineWidth = 3.5;
  c2d.strokeStyle = '#d97706';
  c2d.stroke();

  c2d.beginPath();
  c2d.moveTo(cx - 48, cy - 88);
  c2d.quadraticCurveTo(cx, cy - 106, cx + 48, cy - 86);
  c2d.lineWidth = 10;
  c2d.lineCap = 'round';
  c2d.strokeStyle = browHexCss;
  c2d.stroke();
}

function drawAnimeEye(c2d, cx, cy, isLeft, colors) {
  c2d.save();
  drawEyeIris(c2d, cx, cy, colors.irisHexCss, colors.irisGlowCss);
  drawEyeLashesAndBrow(c2d, cx, cy, isLeft, colors.browHexCss);
  c2d.restore();
}

function drawFaceCheeksAndMouth(c2d) {
  [98, 414].forEach((bx) => {
    c2d.beginPath();
    c2d.ellipse(bx, 326, 35, 16, 0, 0, Math.PI * 2);
    c2d.fillStyle = 'rgba(251, 113, 133, 0.42)';
    c2d.fill();

    c2d.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    c2d.lineWidth = 3.5;
    c2d.lineCap = 'round';
    c2d.beginPath();
    c2d.moveTo(bx - 12, 322);
    c2d.lineTo(bx - 4, 330);
    c2d.moveTo(bx + 2, 322);
    c2d.lineTo(bx + 10, 330);
    c2d.stroke();
  });

  c2d.beginPath();
  c2d.moveTo(256, 290);
  c2d.lineTo(249, 308);
  c2d.lineTo(260, 312);
  c2d.lineWidth = 5;
  c2d.lineCap = 'round';
  c2d.strokeStyle = '#d97706';
  c2d.stroke();

  c2d.beginPath();
  c2d.arc(256, 344, 30, 0.16 * Math.PI, 0.84 * Math.PI);
  c2d.lineWidth = 8;
  c2d.lineCap = 'round';
  c2d.strokeStyle = '#9a3412';
  c2d.stroke();
}

// Texture de visage Anime Haute Définition (Style Star Ocean / SAO / Phantasy Star)
export function createAnimeFaceTexture(irisHexCss, browHexCss, irisGlowCss = '#7dd3fc') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const c2d = canvas.getContext('2d');

  c2d.fillStyle = '#fff0db';
  c2d.fillRect(0, 0, 512, 512);

  const eyeColors = { irisHexCss, browHexCss, irisGlowCss };
  drawAnimeEye(c2d, 154, 242, true, eyeColors);
  drawAnimeEye(c2d, 358, 242, false, eyeColors);
  drawFaceCheeksAndMouth(c2d);

  return new THREE.CanvasTexture(canvas);
}
