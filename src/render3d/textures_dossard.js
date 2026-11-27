import { COLORS } from '../state.js';
import { THREE, dossardTextures } from './shared.js';

function drawFlameSymbol(c2d) {
  const drawFlamePath = () => {
    c2d.beginPath();
    c2d.moveTo(128, 44);
    c2d.bezierCurveTo(164, 78, 192, 114, 184, 152);
    c2d.bezierCurveTo(196, 138, 200, 122, 196, 108);
    c2d.bezierCurveTo(212, 136, 202, 178, 170, 198);
    c2d.bezierCurveTo(146, 212, 110, 212, 86, 198);
    c2d.bezierCurveTo(54, 178, 46, 134, 66, 102);
    c2d.bezierCurveTo(62, 120, 68, 136, 78, 144);
    c2d.bezierCurveTo(68, 108, 96, 76, 128, 44);
    c2d.closePath();
  };

  drawFlamePath();
  c2d.lineWidth = 14;
  c2d.strokeStyle = '#0f172a';
  c2d.stroke();

  const grad = c2d.createLinearGradient(128, 44, 128, 206);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#fef08a');
  grad.addColorStop(1, '#facc15');
  c2d.fillStyle = grad;
  c2d.fill();

  c2d.beginPath();
  c2d.moveTo(128, 102);
  c2d.bezierCurveTo(150, 128, 158, 156, 146, 180);
  c2d.bezierCurveTo(136, 196, 120, 196, 110, 180);
  c2d.bezierCurveTo(98, 156, 106, 128, 128, 102);
  c2d.closePath();
  c2d.fillStyle = '#ffffff';
  c2d.fill();
  c2d.lineWidth = 5;
  c2d.strokeStyle = '#ea580c';
  c2d.stroke();
}

function drawDropSymbol(c2d) {
  c2d.beginPath();
  c2d.moveTo(128, 46);
  c2d.bezierCurveTo(154, 88, 186, 124, 186, 154);
  c2d.arc(128, 154, 58, 0, Math.PI, false);
  c2d.bezierCurveTo(70, 124, 102, 88, 128, 46);
  c2d.closePath();

  c2d.lineWidth = 14;
  c2d.strokeStyle = '#0f172a';
  c2d.stroke();

  const grad = c2d.createLinearGradient(96, 56, 160, 204);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.65, '#e0f2fe');
  grad.addColorStop(1, '#7dd3fc');
  c2d.fillStyle = grad;
  c2d.fill();

  c2d.beginPath();
  c2d.arc(128, 154, 38, Math.PI * 0.58, Math.PI * 1.12, false);
  c2d.lineWidth = 11;
  c2d.strokeStyle = '#ffffff';
  c2d.stroke();

  c2d.beginPath();
  c2d.arc(104, 112, 6.5, 0, Math.PI * 2);
  c2d.fillStyle = '#ffffff';
  c2d.fill();
}

function drawLeafSymbol(c2d) {
  c2d.beginPath();
  c2d.moveTo(96, 180);
  c2d.quadraticCurveTo(74, 196, 62, 206);
  c2d.lineWidth = 18;
  c2d.strokeStyle = '#0f172a';
  c2d.stroke();
  c2d.lineWidth = 9;
  c2d.strokeStyle = '#fef08a';
  c2d.stroke();

  c2d.beginPath();
  c2d.moveTo(182, 56);
  c2d.bezierCurveTo(192, 118, 162, 178, 92, 184);
  c2d.bezierCurveTo(76, 124, 118, 68, 182, 56);
  c2d.closePath();
  c2d.lineWidth = 14;
  c2d.strokeStyle = '#0f172a';
  c2d.stroke();

  const grad = c2d.createLinearGradient(84, 184, 182, 56);
  grad.addColorStop(0, '#dcfce7');
  grad.addColorStop(0.55, '#fef9c3');
  grad.addColorStop(1, '#ffffff');
  c2d.fillStyle = grad;
  c2d.fill();

  c2d.beginPath();
  c2d.moveTo(92, 182);
  c2d.quadraticCurveTo(136, 126, 174, 66);
  c2d.moveTo(116, 152);
  c2d.lineTo(152, 150);
  c2d.moveTo(116, 152);
  c2d.lineTo(106, 120);
  c2d.moveTo(140, 118);
  c2d.lineTo(168, 116);
  c2d.moveTo(140, 118);
  c2d.lineTo(132, 90);
  c2d.lineWidth = 6.5;
  c2d.strokeStyle = '#15803d';
  c2d.stroke();
}

function drawDossardElementalSymbol(c2d, colorKey) {
  c2d.save();
  c2d.lineJoin = 'round';
  c2d.lineCap = 'round';

  if (colorKey === 'red') {
    drawFlameSymbol(c2d);
  } else if (colorKey === 'blue') {
    drawDropSymbol(c2d);
  } else {
    drawLeafSymbol(c2d);
  }

  c2d.restore();
}

export function getDossardTexture(colorKey) {
  if (dossardTextures[colorKey]) return dossardTextures[colorKey];
  const info = COLORS[colorKey];
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const c2d = canvas.getContext('2d');

  // Contour encre manga noir extérieur
  c2d.beginPath();
  c2d.arc(128, 128, 122, 0, Math.PI * 2);
  c2d.fillStyle = '#0f172a';
  c2d.fill();

  // Disque de couleur principal
  c2d.beginPath();
  c2d.arc(128, 128, 110, 0, Math.PI * 2);
  c2d.fillStyle = info.css;
  c2d.fill();
  c2d.lineWidth = 11;
  c2d.strokeStyle = '#ffffff';
  c2d.stroke();

  // Reflet cel-shaded anime en haut à gauche du dossard
  c2d.beginPath();
  c2d.arc(92, 84, 34, 0, Math.PI * 2);
  c2d.fillStyle = 'rgba(255, 255, 255, 0.18)';
  c2d.fill();

  // Symbole élémentaire anime (Flamme sur Rouge, Goutte sur Bleu, Feuille sur Vert)
  drawDossardElementalSymbol(c2d, colorKey);

  const tex = new THREE.CanvasTexture(canvas);
  dossardTextures[colorKey] = tex;
  return tex;
}

export function createChestRoleTexture(roleLetter, isAlly) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const c2d = canvas.getContext('2d');

  c2d.fillStyle = isAlly ? '#fffbeb' : '#1e1b4b';
  c2d.fillRect(0, 0, 128, 128);

  c2d.strokeStyle = '#0f172a';
  c2d.lineWidth = 10;
  c2d.strokeRect(5, 5, 118, 118);

  c2d.strokeStyle = isAlly ? '#f59e0b' : '#c084fc';
  c2d.lineWidth = 6;
  c2d.strokeRect(14, 14, 100, 100);

  c2d.fillStyle = isAlly ? '#b45309' : '#f3e8ff';
  c2d.font = '900 72px Segoe UI, sans-serif';
  c2d.textAlign = 'center';
  c2d.textBaseline = 'middle';
  c2d.fillText(roleLetter, 64, 68);

  return new THREE.CanvasTexture(canvas);
}
