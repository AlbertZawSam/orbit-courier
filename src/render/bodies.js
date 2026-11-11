import * as THREE from 'three';

const LOOK = {
  star: { color: 0xf2c14e, emissive: 0xf2c14e },
  rocky: { color: 0x4a7fb5 },
  moon: { color: 0xb7ad9a },
  gas: { color: 0xc9915a },
  ice: { color: 0xa9d6e5 },
  station: { color: 0xefe8d8 },
};

/** Simple lit spheres for every body, plus the star's point light. Procedural shading comes in stage 8. */
export function createBodies(scene, bodies) {
  const group = new THREE.Group();
  scene.add(group);
  const meshes = {};
  for (const b of bodies) {
    const look = LOOK[b.kind] ?? LOOK.moon;
    const mat = new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.9, metalness: 0, emissive: look.emissive ?? 0x000000 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 32, 20), mat);
    mesh.name = b.id;
    group.add(mesh);
    meshes[b.id] = mesh;
    if (b.kind === 'star') {
      const light = new THREE.PointLight(0xfff2d6, 4, 0, 0);
      mesh.add(light);
    }
  }
  return {
    meshes,
    dispose() { scene.remove(group); group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); },
    update(t) { for (const b of bodies) { const [x, z] = b.pos(t); meshes[b.id].position.set(x, 0, z); } },
  };
}
