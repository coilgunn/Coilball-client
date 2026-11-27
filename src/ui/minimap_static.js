import { FIELD, state } from '../state.js';
import { PARK_LANDMARKS } from '../world.js';
import { uiState } from './shared.js';
import { drawMinimapFgEntities, drawMinimapFgLandmarks } from './minimap_static_fg.js';

const toX = (wx, W) => ((wx + FIELD.width / 2) / FIELD.width) * W;
const toY = (wz, H) => ((wz + FIELD.depth / 2) / FIELD.depth) * H;
const toR = (wr, W) => (wr / FIELD.width) * W;

function drawMinimapLafontaineBg(bgCtx, W, H) {
  const lf = PARK_LANDMARKS.lafontaine;
  bgCtx.fillStyle = 'rgba(14, 165, 233, 0.34)';
  bgCtx.beginPath();
  bgCtx.ellipse(toX(0, W), toY(0, H), Math.max(8, toR(lf.pondRx, W)), Math.max(4, (lf.pondRz / FIELD.depth) * H), 0, 0, Math.PI * 2);
  bgCtx.fill();

  bgCtx.fillStyle = 'rgba(217, 119, 6, 0.72)';
  const bx0 = toX(-lf.bridgeHalfX, W);
  const bx1 = toX(lf.bridgeHalfX, W);
  const bz0 = toY(-lf.bridgeHalfZ, H);
  const bz1 = toY(lf.bridgeHalfZ, H);
  bgCtx.fillRect(bx0, bz0, bx1 - bx0, bz1 - bz0);
  bgCtx.strokeStyle = '#e2e8f0';
  bgCtx.lineWidth = 1.2;
  bgCtx.strokeRect(bx0, bz0, bx1 - bx0, bz1 - bz0);

  [-lf.fountainX, lf.fountainX].forEach((fx) => {
    bgCtx.beginPath();
    bgCtx.arc(toX(fx, W), toY(0, H), Math.max(2.5, toR(lf.fountainR, W)), 0, Math.PI * 2);
    bgCtx.fillStyle = 'rgba(224, 242, 254, 0.65)';
    bgCtx.fill();
  });
}

function drawMinimapSaintViateurBg(bgCtx, W, H) {
  const sv = PARK_LANDMARKS.saintViateur;
  bgCtx.fillStyle = 'rgba(14, 165, 233, 0.34)';
  bgCtx.beginPath();
  bgCtx.ellipse(toX(0, W), toY(0, H), Math.max(8, toR(sv.pondRx, W)), Math.max(6, (sv.pondRz / FIELD.depth) * H), 0, 0, Math.PI * 2);
  bgCtx.fill();

  bgCtx.fillStyle = '#15803d';
  bgCtx.beginPath();
  bgCtx.ellipse(toX(0, W), toY(0, H), Math.max(5, toR(sv.islandRx, W)), Math.max(4, (sv.islandRz / FIELD.depth) * H), 0, 0, Math.PI * 2);
  bgCtx.fill();
  bgCtx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
  bgCtx.lineWidth = 1.2;
  bgCtx.stroke();

  bgCtx.fillStyle = 'rgba(217, 119, 6, 0.8)';
  const bz0 = toY(-sv.bridgeHalfZ, H);
  const bh = toY(sv.bridgeHalfZ, H) - bz0;
  [[-sv.bridgeOuterX, -sv.bridgeInnerX], [sv.bridgeInnerX, sv.bridgeOuterX]].forEach(([x0, x1]) => {
    const px0 = toX(x0, W);
    const pw = toX(x1, W) - px0;
    bgCtx.fillRect(px0, bz0, pw, bh);
    bgCtx.strokeRect(px0, bz0, pw, bh);
  });
}

function drawMinimapMontRoyalBg(bgCtx, W, H) {
  [34, 24, 14].forEach((r, idx) => {
    bgCtx.strokeStyle = idx === 2 ? 'rgba(226, 232, 240, 0.42)' : 'rgba(52, 211, 153, 0.25)';
    bgCtx.lineWidth = idx === 2 ? 1.5 : 1.0;
    bgCtx.beginPath();
    bgCtx.arc(toX(0, W), toY(0, H), Math.max(4, toR(r, W)), 0, Math.PI * 2);
    bgCtx.stroke();
  });
  const mr = PARK_LANDMARKS.montRoyal;
  bgCtx.fillStyle = 'rgba(14, 165, 233, 0.48)';
  bgCtx.beginPath();
  bgCtx.ellipse(toX(mr.lakeX, W), toY(mr.lakeZ, H), Math.max(3, toR(mr.lakeRx, W)), Math.max(2.5, (mr.lakeRz / FIELD.depth) * H), 0, 0, Math.PI * 2);
  bgCtx.fill();
}

function drawMinimapRiftLanesAndRiver(bgCtx, W, H, rf) {
  bgCtx.strokeStyle = 'rgba(161, 120, 74, 0.44)';
  bgCtx.lineWidth = Math.max(8, toR(14.5, W));
  bgCtx.lineCap = 'round';
  bgCtx.lineJoin = 'round';
  bgCtx.beginPath();
  bgCtx.moveTo(toX(-76, W), toY(44, H));
  bgCtx.lineTo(toX(-76, W), toY(-56, H));
  bgCtx.quadraticCurveTo(toX(-76, W), toY(-76, H), toX(-56, W), toY(-76, H));
  bgCtx.lineTo(toX(44, W), toY(-76, H));
  bgCtx.stroke();

  bgCtx.beginPath();
  bgCtx.moveTo(toX(-44, W), toY(76, H));
  bgCtx.lineTo(toX(56, W), toY(76, H));
  bgCtx.quadraticCurveTo(toX(76, W), toY(76, H), toX(76, W), toY(56, H));
  bgCtx.lineTo(toX(76, W), toY(-44, H));
  bgCtx.stroke();

  bgCtx.beginPath();
  bgCtx.moveTo(toX(-56, W), toY(56, H));
  bgCtx.lineTo(toX(56, W), toY(-56, H));
  bgCtx.stroke();

  bgCtx.strokeStyle = 'rgba(14, 116, 144, 0.65)';
  bgCtx.lineWidth = Math.max(10, toR(rf.riverHalfWidth * 2, W));
  bgCtx.beginPath();
  bgCtx.moveTo(toX(-85, W), toY(-85, H));
  bgCtx.lineTo(toX(85, W), toY(85, H));
  bgCtx.stroke();

  bgCtx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
  bgCtx.lineWidth = Math.max(4, toR(rf.riverHalfWidth * 0.9, W));
  bgCtx.beginPath();
  bgCtx.moveTo(toX(-85, W), toY(-85, H));
  bgCtx.lineTo(toX(85, W), toY(85, H));
  bgCtx.stroke();

  bgCtx.fillStyle = 'rgba(14, 116, 144, 0.78)';
  bgCtx.beginPath();
  bgCtx.arc(toX(0, W), toY(0, H), Math.max(7, toR(rf.centerLakeRadius, W)), 0, Math.PI * 2);
  bgCtx.fill();
  bgCtx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
  bgCtx.lineWidth = 1.1;
  bgCtx.stroke();
}

function drawMinimapRiftPitsAndChevrons(bgCtx, W, H, rf) {
  bgCtx.strokeStyle = 'rgba(224, 242, 254, 0.92)';
  bgCtx.lineWidth = 1.8;
  bgCtx.lineCap = 'round';
  bgCtx.lineJoin = 'round';
  [-1, 1].forEach((dir) => {
    [20, 38, 56].forEach((d) => {
      const cx = toX(dir * d, W);
      const cy = toY(dir * d, H);
      const s = 4.2;
      const ux = dir * 0.7071;
      const uy = dir * 0.7071;
      const nx = -0.7071;
      const ny = 0.7071;
      bgCtx.beginPath();
      bgCtx.moveTo(cx - ux * s * 0.65 + nx * s, cy - uy * s * 0.65 + ny * s);
      bgCtx.lineTo(cx + ux * s, cy + uy * s);
      bgCtx.lineTo(cx - ux * s * 0.65 - nx * s, cy - uy * s * 0.65 - ny * s);
      bgCtx.stroke();
    });
  });

  [
    { pit: rf.baronPit, glow: 'rgba(168, 85, 247, 0.72)', pts: 4 },
    { pit: rf.dragonPit, glow: 'rgba(245, 158, 11, 0.72)', pts: 3 }
  ].forEach(({ pit, glow, pts }) => {
    const px = toX(pit.x, W);
    const py = toY(pit.z, H);
    bgCtx.fillStyle = 'rgba(14, 116, 144, 0.68)';
    bgCtx.beginPath();
    bgCtx.arc(px, py, Math.max(5, toR(pit.r, W)), 0, Math.PI * 2);
    bgCtx.fill();
    const rSigil = Math.max(3.2, toR(pit.r * 0.56, W));
    bgCtx.strokeStyle = glow;
    bgCtx.lineWidth = 1.2;
    bgCtx.beginPath();
    bgCtx.arc(px, py, rSigil, 0, Math.PI * 2);
    bgCtx.stroke();
    [0, Math.PI / pts].forEach((rot) => {
      bgCtx.beginPath();
      for (let v = 0; v <= pts; v++) {
        const a = rot + (v / pts) * Math.PI * 2;
        const vx = px + Math.cos(a) * rSigil;
        const vy = py + Math.sin(a) * rSigil;
        if (v === 0) bgCtx.moveTo(vx, vy);
        else bgCtx.lineTo(vx, vy);
      }
      bgCtx.stroke();
    });
  });
}

function drawMinimapRiftBases(bgCtx, W, H, rf) {
  [
    { cx: -88, cz: 88, a0: -Math.PI / 2, a1: 0, dir: 1, fill: 'rgba(100, 116, 139, 0.52)', ring: 'rgba(250, 204, 21, 0.55)' },
    { cx: 88, cz: -88, a0: Math.PI / 2, a1: Math.PI, dir: -1, fill: 'rgba(100, 116, 139, 0.52)', ring: 'rgba(192, 132, 252, 0.55)' }
  ].forEach((b) => {
    bgCtx.fillStyle = b.fill;
    bgCtx.beginPath();
    bgCtx.moveTo(toX(b.cx, W), toY(b.cz, H));
    bgCtx.arc(toX(b.cx, W), toY(b.cz, H), toR(rf.baseRadius, W), b.a0, b.a1);
    bgCtx.closePath();
    bgCtx.fill();
    bgCtx.strokeStyle = b.ring;
    bgCtx.lineWidth = 1.4;
    bgCtx.stroke();

    bgCtx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    bgCtx.lineWidth = 1.0;
    [20, 34, 46].forEach((rr) => {
      bgCtx.beginPath();
      bgCtx.arc(toX(b.cx, W), toY(b.cz, H), toR(rr, W), b.a0, b.a1);
      bgCtx.stroke();
    });
    [
      [b.cx + b.dir * 12, b.cz - b.dir * 44],
      [b.cx + b.dir * 34, b.cz - b.dir * 34],
      [b.cx + b.dir * 44, b.cz - b.dir * 12]
    ].forEach(([tx, tz]) => {
      bgCtx.beginPath();
      bgCtx.moveTo(toX(b.cx, W), toY(b.cz, H));
      bgCtx.lineTo(toX(tx, W), toY(tz, H));
      bgCtx.stroke();
    });
  });
}

export function buildMinimapStaticLayers(W, H, mapMeta) {
  if (!uiState.minimapStaticBgCanvas) uiState.minimapStaticBgCanvas = document.createElement('canvas');
  if (!uiState.minimapStaticFgCanvas) uiState.minimapStaticFgCanvas = document.createElement('canvas');
  uiState.minimapStaticBgCanvas.width = W;
  uiState.minimapStaticBgCanvas.height = H;
  uiState.minimapStaticFgCanvas.width = W;
  uiState.minimapStaticFgCanvas.height = H;

  const bgCtx = uiState.minimapStaticBgCanvas.getContext('2d');
  const fgCtx = uiState.minimapStaticFgCanvas.getContext('2d');
  if (!bgCtx || !fgCtx) return false;

  bgCtx.clearRect(0, 0, W, H);
  bgCtx.fillStyle = mapMeta.minimapBg || '#071122';
  bgCtx.fillRect(0, 0, W, H);

  if (mapMeta.decorStyle === 'lafontaine') drawMinimapLafontaineBg(bgCtx, W, H);
  else if (mapMeta.decorStyle === 'saint-viateur') drawMinimapSaintViateurBg(bgCtx, W, H);
  else if (mapMeta.decorStyle === 'jarry') {
    bgCtx.strokeStyle = 'rgba(234, 88, 12, 0.3)';
    bgCtx.lineWidth = Math.max(2, toR(3.4, W));
    bgCtx.strokeRect(toX(-72, W), toY(-61, H), toX(72, W) - toX(-72, W), toY(61, H) - toY(-61, H));
  } else if (mapMeta.decorStyle === 'mont-royal') drawMinimapMontRoyalBg(bgCtx, W, H);
  else if (mapMeta.decorStyle === 'rift') {
    const rf = PARK_LANDMARKS.rift;
    drawMinimapRiftLanesAndRiver(bgCtx, W, H, rf);
    drawMinimapRiftPitsAndChevrons(bgCtx, W, H, rf);
    drawMinimapRiftBases(bgCtx, W, H, rf);
  }

  if (mapMeta.decorStyle !== 'rift') {
    bgCtx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    bgCtx.lineWidth = 5;
    [FIELD.laneTopZ, FIELD.laneBotZ].forEach((lz) => {
      bgCtx.beginPath();
      bgCtx.moveTo(toX(FIELD.allyGoalX, W), toY(lz, H));
      bgCtx.lineTo(toX(FIELD.enemyGoalX, W), toY(lz, H));
      bgCtx.stroke();
    });
    bgCtx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    bgCtx.lineWidth = 1;
    bgCtx.beginPath();
    bgCtx.moveTo(toX(0, W), 0);
    bgCtx.lineTo(toX(0, W), H);
    bgCtx.stroke();
  }

  fgCtx.clearRect(0, 0, W, H);
  drawMinimapFgLandmarks(fgCtx, W, H, mapMeta);
  drawMinimapFgEntities(fgCtx, W, H);
  return true;
}

export function syncMinimapCanvasDimensions() {
  const c = uiState.minimapCanvas;
  if (!c) return;
  const isSquare = Math.abs(FIELD.width - FIELD.depth) < 1;
  if (isSquare) {
    c.width = state.minimapExpanded ? 344 : 238;
    c.height = state.minimapExpanded ? 344 : 238;
  } else {
    c.width = state.minimapExpanded ? 368 : 268;
    c.height = state.minimapExpanded ? 238 : 174;
  }
  uiState.minimapStaticKey = '';
}
