import * as THREE from 'three';

// Two open filaments stretch along the discharge. The center of each ribbon
// catches light while both edges feather out into the surrounding air.
function windTrails() {
  const positions = [], colors = [], indices = [];
  const paths = [
    [[-.12,.1,-.06],[-.48,.28,-.71],[-.62,.63,-1.54],[-.18,.84,-2.51],[.40,.8,-3.26]],
    [[-.14,.18,-.85],[-.42,.31,-1.16],[-.66,.35,-1.63],[-.83,.30,-2.02],[-.96,.21,-2.32]],
  ];
  const tint = new THREE.Color('#b2d4eb');
  for (const path of paths) {
    const first = positions.length/3;
    const curve = new THREE.CatmullRomCurve3(path.map(p=>new THREE.Vector3(...p)));
    for (let i=0;i<=32;i++) {
      const t=i/32, center=curve.getPoint(t);
      const taper=Math.sin(Math.PI*t);
      const width=.083*taper;
      for (const edge of [-1,0,1]) {
        positions.push(center.x+edge*width,center.y+edge*width*(t-.45),center.z);
        colors.push(tint.r,tint.g,tint.b,edge===0 ? .78*taper : 0);
      }
      if (i) {
        const k=first+i*3;
        indices.push(k-3,k,k+1,k-3,k+1,k-2, k-2,k+1,k+2,k-2,k+2,k-1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));
  geometry.setIndex(indices);
  return new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({
    vertexColors:true,transparent:true,depthWrite:false,toneMapped:false,
    side:THREE.DoubleSide,forceSinglePass:true,
  }));
}

// A white filament inside a wider blue fringe. Two intersecting strips keep
// each fork visible looking down the bore and looking across another player.
const strokes = [
  [[0,0,0], [.22,.10,-1], [-.32,.28,-1.52], [.16,.17,-1.6], [-.1,.45,-2.42], [.56,.28,-3.48]],
  [[-.32,.28,-1.52], [-.96,.45,-1.64], [-.79,.52,-1.88], [-1.53,.79,-2.15]],
  [[.16,.17,-1.6], [.62,-.43,-1.84], [.54,-.56,-2.06], [1.19,-.74,-2.44]],
];
export const CLOUDBREAK_BOLT_LENGTH=-strokes[0].at(-1)[2];
export function createCloudbreakBolt(connectEnds=false) {
  const positions = [], colors = [], indices = [], bends = [];
  const fringe = new THREE.Color('#588dff'), ice = new THREE.Color('#e4fcff');
  for (let branch = 0; branch < strokes.length; branch++) {
    const path = strokes[branch];
    for (let plane = 0; plane < 2; plane++) {
      const first = positions.length / 3;
      for (let i = 0; i < path.length; i++) {
        const [px, py, z] = path[i];
        const tip=connectEnds&&branch===0&&i===path.length-1;
        const x=tip?0:px,y=tip?0:py;
        const width = (branch ? .16 : .29) * (1 - i / (path.length - 1));
        for (const [j, edge] of [-1,-.24,.24,1].entries()) {
          positions.push(x + (plane ? 0 : edge*width), y + (plane ? edge*width : 0), z);
          // Evaluate the bend at the centerline so both planes and each
          // branching junction stay joined as the silhouette changes.
          bends.push(tip?0:.38*Math.sin(5*z),tip?0:.43*Math.sin(3*z+x),tip?0:.16*Math.sin(4*y));
          const core = j === 1 || j === 2;
          colors.push(...(core ? ice : fringe).toArray(), core ? 1 : 0);
          if (i && j) {
            const k = first + 4*i + j;
            indices.push(k-5,k-4,k, k-5,k,k-1);
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(bends, 3)];
  geometry.setIndex(indices);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
    side: THREE.DoubleSide, forceSinglePass: true,
  }));
}

// A camera-facing glint gives the lightning a bright ignition point from
// every angle. All mounted pistols share this small, immutable texture.
let glintTexture;
function ignitionGlint() {
  if (!glintTexture) {
    const size = 64;
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (2*x+1)/size - 1, v = (2*y+1)/size - 1;
        const radius = Math.hypot(u,v);
        const halo = .52*Math.exp(-6*radius);
        const rays = Math.exp(-22*Math.sqrt(Math.abs(u*v))) * Math.max(0,1-radius);
        const hot = Math.exp(-5*radius);
        const i = 4*(y*size+x);
        pixels[i] = 143+112*hot;
        pixels[i+1] = 194+57*hot;
        pixels[i+2] = 255-34*hot;
        pixels[i+3] = 255*Math.min(1,halo+rays+hot);
      }
    }
    glintTexture = new THREE.DataTexture(pixels,size,size);
    glintTexture.colorSpace = THREE.SRGBColorSpace;
    glintTexture.magFilter = glintTexture.minFilter = THREE.LinearFilter;
    glintTexture.needsUpdate = true;
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map:glintTexture, transparent:true, depthWrite:false, toneMapped:false,
    blending:THREE.AdditiveBlending,
  }));
  sprite.position.z = -1.25;
  sprite.renderOrder = 2;
  return sprite;
}

export class CloudbreakFlash extends THREE.Group {
  constructor(size) {
    super();
    this.name = 'cloudbreak-flash';
    this.scale.setScalar(size);
    this.trails = windTrails();
    this.bolt = createCloudbreakBolt();
    this.bolt.renderOrder = 1;
    this.glint = ignitionGlint();
    this.add(this.trails, this.bolt, this.glint);
    this.visible = false;
  }

  ignite(random) {
    this.elapsed = 0;
    this.life = .25 + random() * .055;
    this.roll = random() * Math.PI * 2;
    this.twist = random() < .5 ? -.23 : .23;
    this.trails.rotation.set((random()-.5)*.33, (random()-.5)*.33, this.roll);
    this.bolt.rotation.z = this.roll + random() * 1.1;
    this.bolt.morphTargetInfluences[0] = random();
    this.bolt.scale.set(1.1+random()*.6, 1.15+random()*.65, 1.14+random()*.38);
    this.glint.material.rotation = this.roll;
    this.visible = true;
    this.advance(0);
  }

  advance(dt) {
    if (!this.visible) return;
    this.elapsed += dt;
    const t = this.elapsed / this.life;
    if (t >= 1) {
      this.visible = false;
      return;
    }
    this.bolt.visible = this.elapsed < .105;
    this.bolt.material.opacity = 1 - THREE.MathUtils.smoothstep(this.elapsed, .045, .105);
    this.glint.visible = this.elapsed < .09;
    this.glint.material.opacity = 1 - THREE.MathUtils.smoothstep(this.elapsed, .012, .09);
    this.glint.scale.setScalar(3.8 + 1.6*t);
    const drift = 1 - (1-t)**2;
    this.trails.scale.set(.72+.65*drift,.72+.48*drift,.64+.63*drift);
    this.trails.position.set(0,.39*t*t,-.1-.91*drift);
    this.trails.rotation.z = this.roll + t*this.twist;
    this.trails.material.opacity = (1-THREE.MathUtils.smoothstep(t,.3,1))
      * THREE.MathUtils.smoothstep(this.elapsed,0,.036);
  }
}
