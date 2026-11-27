import { FIELD } from '../state.js';
import { CANOPY_SPEC, JUNGLE_BUSHES, JUNGLE_OBSTACLES, PARK_LANDMARKS } from '../world.js';

const toX = (wx, W) => ((wx + FIELD.width / 2) / FIELD.width) * W;
const toY = (wz, H) => ((wz + FIELD.depth / 2) / FIELD.depth) * H;
const toR = (wr, W) => (wr / FIELD.width) * W;

function drawMinimapCanopy(fgCtx, W, H) {
  if (!CANOPY_SPEC.hasCanopy) return;
  fgCtx.fillStyle = 'rgba(180, 120, 60, 0.32)';
  CANOPY_SPEC.bridges.forEach((b) => {
    const x0 = toX(b.x0, W);
    const y0 = toY(b.z0, H);
    fgCtx.fillRect(x0, y0, Math.max(1.5, toX(b.x1, W) - x0), Math.max(1.5, toY(b.z1, H) - y0));
  });
  fgCtx.fillStyle = 'rgba(217, 119, 6, 0.42)';
  CANOPY_SPEC.decks.forEach((d) => {
    const x0 = toX(d.x0, W);
    const y0 = toY(d.z0, H);
    fgCtx.fillRect(x0, y0, Math.max(2, toX(d.x1, W) - x0), Math.max(2, toY(d.z1, H) - y0));
  });
}

function drawMinimapRiftFg(fgCtx, W, H) {
  const rf = PARK_LANDMARKS.rift;
  fgCtx.lineCap = 'round';
  fgCtx.lineJoin = 'round';
  fgCtx.fillStyle = '#0ea5e9';
  fgCtx.strokeStyle = '#e0f2fe';
  fgCtx.lineWidth = 1.5;
  fgCtx.beginPath();
  fgCtx.arc(toX(0, W), toY(0, H), Math.max(3.2, toR(rf.waterfallRadius + 0.6, W)), 0, Math.PI * 2);
  fgCtx.fill();
  fgCtx.stroke();
  rf.wallChains.forEach((chain) => {
    if (!chain.pts || chain.pts.length < 2) return;
    const isBase = chain.kind === 'base';
    fgCtx.beginPath();
    chain.pts.forEach(([px, pz], idx) => {
      if (idx === 0) fgCtx.moveTo(toX(px, W), toY(pz, H));
      else fgCtx.lineTo(toX(px, W), toY(pz, H));
    });
    fgCtx.strokeStyle = isBase ? '#64748b' : '#1e293b';
    fgCtx.lineWidth = Math.max(3.5, toR(chain.radius * 2, W));
    fgCtx.stroke();
    fgCtx.strokeStyle = isBase
      ? chain.teamSide === 'ally' ? 'rgba(250, 204, 21, 0.78)' : 'rgba(192, 132, 252, 0.78)'
      : '#36692b';
    fgCtx.lineWidth = Math.max(1.8, toR(chain.radius * 1.15, W));
    fgCtx.stroke();
  });
}

export function drawMinimapFgLandmarks(fgCtx, W, H, mapMeta) {
  drawMinimapCanopy(fgCtx, W, H);
  if (mapMeta.decorStyle === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    const cx0 = toX(sv.chaletMinX, W);
    const cy0 = toY(sv.chaletMinZ, H);
    const cw = toX(sv.chaletMaxX, W) - cx0;
    const chH = toY(sv.chaletMaxZ, H) - cy0;
    fgCtx.fillStyle = '#e7e5e4';
    fgCtx.strokeStyle = '#475569';
    fgCtx.lineWidth = 1.4;
    fgCtx.fillRect(cx0, cy0, cw, chH);
    fgCtx.strokeRect(cx0, cy0, cw, chH);
    fgCtx.fillStyle = '#475569';
    fgCtx.fillRect(cx0 + cw * 0.25, cy0 + chH * 0.25, cw * 0.5, chH * 0.5);
  } else if (mapMeta.decorStyle === 'jarry') {
    const gr = Math.max(4.5, toR(PARK_LANDMARKS.jarry.gazeboRadius, W));
    fgCtx.fillStyle = '#2d6a4f';
    fgCtx.strokeStyle = '#f8fafc';
    fgCtx.lineWidth = 1.3;
    fgCtx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const px = toX(0, W) + Math.cos(ang) * gr;
      const py = toY(0, H) + Math.sin(ang) * gr;
      if (i === 0) fgCtx.moveTo(px, py);
      else fgCtx.lineTo(px, py);
    }
    fgCtx.closePath();
    fgCtx.fill();
    fgCtx.stroke();
  } else if (mapMeta.decorStyle === 'mont-royal') {
    const mr = PARK_LANDMARKS.montRoyal;
    const cx = toX(mr.crossX, W);
    const cy = toY(mr.crossZ, H);
    fgCtx.strokeStyle = '#fde047';
    fgCtx.lineWidth = 2.2;
    fgCtx.beginPath();
    fgCtx.moveTo(cx - 4.5, cy);
    fgCtx.lineTo(cx + 4.5, cy);
    fgCtx.moveTo(cx, cy - 4.5);
    fgCtx.lineTo(cx, cy + 4.5);
    fgCtx.stroke();
  } else if (mapMeta.decorStyle === 'rift') {
    drawMinimapRiftFg(fgCtx, W, H);
  }
}

export function drawMinimapFgEntities(fgCtx, W, H) {
  fgCtx.fillStyle = 'rgba(16, 185, 129, 0.34)';
  fgCtx.strokeStyle = 'rgba(16, 185, 129, 0.72)';
  fgCtx.lineWidth = 0.9;
  JUNGLE_BUSHES.forEach((b) => {
    fgCtx.beginPath();
    fgCtx.arc(toX(b.x, W), toY(b.z, H), Math.max(2.2, toR(b.radius, W)), 0, Math.PI * 2);
    fgCtx.fill();
    fgCtx.stroke();
  });

  fgCtx.fillStyle = '#334155';
  fgCtx.strokeStyle = '#64748b';
  fgCtx.lineWidth = 0.9;
  JUNGLE_OBSTACLES.forEach((obs) => {
    if (obs.kind === 'gazebo') return;
    fgCtx.beginPath();
    fgCtx.arc(toX(obs.x, W), toY(obs.z, H), Math.max(2.2, toR(obs.radius, W)), 0, Math.PI * 2);
    fgCtx.fill();
    fgCtx.stroke();
  });

  if (CANOPY_SPEC.hasCanopy) {
    fgCtx.fillStyle = '#475569';
    CANOPY_SPEC.trunks.forEach((tr) => {
      fgCtx.beginPath();
      fgCtx.arc(toX(tr.x, W), toY(tr.z, H), Math.max(1.6, toR(tr.radius, W)), 0, Math.PI * 2);
      fgCtx.fill();
    });
  }

  [
    { x: FIELD.allyGoalX, z: FIELD.allyGoalZ || 0, col: '#facc15' },
    { x: FIELD.enemyGoalX, z: FIELD.enemyGoalZ || 0, col: '#c084fc' }
  ].forEach((g) => {
    fgCtx.beginPath();
    fgCtx.arc(toX(g.x, W), toY(g.z, H), Math.max(4, toR(FIELD.goalRadius * 1.25, W)), 0, Math.PI * 2);
    fgCtx.strokeStyle = g.col;
    fgCtx.lineWidth = 1.8;
    fgCtx.stroke();
  });
}
