import { ctx } from '../state.js';

export const THREE = ctx.THREE;

export const worldState = {
  worldGroup: null,
  visionCacheMapId: '',
  visionCacheLen: -1,
  visionCacheNums: new Float64Array(64)
};

// Références stables mutées sur place lors d'un changement d'arène
export const CANOPY_SPEC = {};
export const JUNGLE_OBSTACLES = [];
export const JUNGLE_WALLS = [];
export const JUNGLE_BUSHES = [];

export const animatedWaterTextures = [];

// Arbres / feuillages enregistrés pour masquage dynamique s'ils croisent la ligne de visée caméra
export const cameraTreeOccluders = [];

// Tampons réutilisés sans allocation dans les boucles chaudes LOS / vision
export const _losSeg = { ax: 0, az: 0, bx: 0, bz: 0 };
export const _losRay = { ox: 0, oz: 0, dirX: 0, dirZ: 0 };
export const _visionRay = { ox: 0, oz: 0, dirX: 0, dirZ: 0 };
export const _rayState = { ox: 0, oz: 0, dirX: 0, dirZ: 0, minDist: 0 };
