// Gives a Blender model the game's anime look: toon shading that keeps its colours and textures,
// and an ink outline drawn as an inverted hull (works on rigged, animated meshes too).
// Opt a model out with { "key": "...", "toon": false } in models/manifest.json.
import { BackSide, Box3, Mesh, MeshBasicMaterial, MeshToonMaterial, SkinnedMesh, Vector3 } from 'three';

const ink = new Map(); // one outline material per thickness

function inkMaterial(color, thickness) {
  const key = `${color}:${thickness.toFixed(4)}`;
  if (ink.has(key)) return ink.get(key);
  const m = new MeshBasicMaterial({ color, side: BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normalize(normal) * ${thickness.toFixed(5)};`);
  };
  m.customProgramCacheKey = () => `ink-${thickness.toFixed(5)}`;
  ink.set(key, m);
  return m;
}

function toToon(mat, ramp) {
  if (!mat || mat.isMeshToonMaterial || mat.isMeshBasicMaterial) return mat;
  return new MeshToonMaterial({
    name: mat.name,
    color: mat.color?.clone(),
    map: mat.map ?? null,
    gradientMap: ramp,
    emissive: mat.emissive?.clone(),
    emissiveMap: mat.emissiveMap ?? null,
    emissiveIntensity: mat.emissiveIntensity ?? 1,
    normalMap: mat.normalMap ?? null,
    alphaMap: mat.alphaMap ?? null,
    transparent: mat.transparent,
    opacity: mat.opacity,
    alphaTest: mat.alphaTest,
    side: mat.side,
  });
}

// Mutates `root` (call it on a clone). `outline` is false for rooms and in low-spec mode.
export function toonify(root, { ramp, outline = true, color = '#0b0a10' } = {}) {
  const size = new Box3().setFromObject(root).getSize(new Vector3());
  const thickness = Math.max(size.y, 0.5) * 0.012;
  const meshes = [];
  root.traverse((o) => o.isMesh && !o.userData.inkHull && meshes.push(o));
  for (const mesh of meshes) {
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => toToon(m, ramp)) : toToon(mesh.material, ramp);
    if (!outline || mesh.material?.transparent) continue;
    const hull = mesh.isSkinnedMesh ? new SkinnedMesh(mesh.geometry, inkMaterial(color, thickness)) : new Mesh(mesh.geometry, inkMaterial(color, thickness));
    if (mesh.isSkinnedMesh) hull.bind(mesh.skeleton, mesh.bindMatrix);
    hull.userData.inkHull = true;
    hull.raycast = () => {}; // clicks go to the model, not its outline
    hull.castShadow = false;
    mesh.add(hull);
  }
  return root;
}
