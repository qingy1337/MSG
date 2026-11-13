import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createLoadoutWeapon,createArmorDisplay,disposeLoadoutModel,visibleModelBounds} from './loadoutModels.mjs';

// One lazily created renderer produces cached stills. No render loop or WebGL
// context per square, and only items the player actually opens are generated.
const cache=new Map(),queue=new Map();
let renderer,scene,camera,environment,scheduled=false,unavailable=false;
function init() {
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  renderer.setSize(384,288);renderer.setPixelRatio(1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,50);
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
  environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;
  room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff,0x729683,2.0));
  const key=new THREE.DirectionalLight(0xfff7eb,3.5);key.position.set(-3,5,-4);scene.add(key);
  const fill=new THREE.DirectionalLight(0xe6f7ff,2.0);fill.position.set(4,1,3);scene.add(fill);
}
function fillImage(img,url) {
  if(!img.isConnected)return;
  img.onload=()=>img.parentElement?.classList.add('has-image');
  img.src=url;
  if(img.complete&&img.naturalWidth)img.parentElement?.classList.add('has-image');
}
function requestImages(root) {
  if(unavailable || !root)return;
  for(const img of root.querySelectorAll('img[data-gear-key]')) {
    if(img.src || img.offsetParent===null)continue;
    const key=`${img.dataset.gearKind}:${img.dataset.gearKey}`;
    if(cache.has(key)){fillImage(img,cache.get(key));continue;}
    if(!queue.has(key))queue.set(key,{kind:img.dataset.gearKind,key:img.dataset.gearKey,weapon:img.dataset.weaponKey,images:new Set()});
    queue.get(key).images.add(img);
  }
  if(queue.size&&!scheduled){scheduled=true;requestAnimationFrame(drawNext);}
}
function drawNext() {
  scheduled=false;
  if(document.hidden){queue.clear();return;}
  const next=queue.entries().next().value;if(!next)return;
  const [key,entry]=next;queue.delete(key);
  const visible=[...entry.images].filter(img=>img.isConnected&&img.offsetParent!==null);
  let model;
  try {
    if(visible.length) {
      if(!renderer)init();
      model=entry.kind==='armor'?createArmorDisplay(entry.key):createLoadoutWeapon(entry.weapon,entry.key);
      if(entry.kind==='weapon')model.rotation.y=Math.PI/2;
      let bounds=visibleModelBounds(model);model.position.sub(bounds.getCenter(new THREE.Vector3()));
      scene.add(model);bounds=visibleModelBounds(model);
      camera.position.set(...(entry.kind==='armor'?[3.1,2,-6]:[-2.6,2,6]));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
      const viewBounds=new THREE.Box3();
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]) {
        viewBounds.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
      }
      const size=viewBounds.getSize(new THREE.Vector3()),center=viewBounds.getCenter(new THREE.Vector3());
      const halfHeight=Math.max(size.y/2,size.x/(2*4/3))*(entry.kind==='armor'?1.1:1.06);
      camera.left=center.x-halfHeight*4/3;camera.right=center.x+halfHeight*4/3;
      camera.top=center.y+halfHeight;camera.bottom=center.y-halfHeight;camera.updateProjectionMatrix();
      renderer.render(scene,camera);
      const url=renderer.domElement.toDataURL('image/webp',.92);cache.set(key,url);
      for(const img of entry.images)fillImage(img,url);
    }
  } catch(error) {
    // Equipment remains usable with the vector fallback if WebGL is unavailable.
    console.warn('Equipment preview unavailable:',error);unavailable=true;queue.clear();
  } finally {
    if(model){scene.remove(model);disposeLoadoutModel(model);}
  }
  if(queue.size&&!scheduled){scheduled=true;requestAnimationFrame(drawNext);}
}
document.addEventListener('loadout:thumbnails',event=>requestImages(event.detail?.root));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestImages(document.getElementById('character-loadout'));});
requestImages(document.getElementById('character-loadout'));
window.addEventListener('pagehide',event=>{if(!event.persisted){queue.clear();cache.clear();environment?.dispose();renderer?.dispose();}});
