import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type PaintSettings = { tool: string; brush: string; color: string; size: number; opacity: number; flow: number; wetness: number; viscosity: number; pressure: boolean; roughness: number };
export type PaintLayer = { id: number; name: string; visible: boolean; opacity: number; locked?: boolean };
type Surface = { mesh: THREE.Mesh; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; base: HTMLCanvasElement; layers: Map<number, HTMLCanvasElement> };
const SIZE = 1024;
function canvas() { const c = document.createElement('canvas'); c.width = c.height = SIZE; return c; }
function starter(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d')!;
  let seed = 19; const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  // Layered, irregular bristle ribbons give the sample its hand-painted glaze.
  for (let ribbon = 0; ribbon < 4; ribbon++) {
    const start = -180 + ribbon * 335;
    for (let i = 0; i < 95; i++) {
      const shift = (i / 95 - .5) * (ribbon === 1 ? 140 : 110);
      ctx.beginPath(); ctx.moveTo(start - 90 + shift, 950);
      ctx.bezierCurveTo(start + 250 + shift, 760, start + 400 + shift, 660, start + 170 + shift, 430);
      ctx.bezierCurveTo(start + 70 + shift, 325, start + 130 + shift, 220, start + 330 + shift, 120);
      ctx.lineWidth = 1.7 + random() * 3.4;
      ctx.strokeStyle = ['#234bae', '#244cac', '#315bb4', '#345fba', '#5178c6', '#183e96'][Math.floor(random() * 6)];
      ctx.globalAlpha = .34 + random() * .5; ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 2500; i++) { ctx.fillStyle = random() > .6 ? 'rgba(250,240,215,.19)' : 'rgba(36,53,93,.07)'; ctx.fillRect(random() * SIZE, random() * SIZE, .8 + random() * 1.7, .7 + random() * 2); }
}

export class PaintingEngine {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(37, 1, .1, 100);
  controls: OrbitControls; model = new THREE.Group(); surfaces: Surface[] = [];
  layers: PaintLayer[] = [{ id: 2, name: 'Blue expression', visible: true, opacity: 100 }, { id: 1, name: 'Ceramic base', visible: true, opacity: 100, locked: true }];
  activeLayer = 2; settings: PaintSettings; onChange: () => void; onPaint: () => void; onPick: (color: string) => void;
  raycaster = new THREE.Raycaster(); pointer = new THREE.Vector2(); drawing = false; space = false;
  last: { x: number; y: number; surface: Surface } | null = null;
  undoStack: { surface: Surface; layer: number; data: ImageData }[] = []; redoStack: typeof this.undoStack = [];
  frame = 0; observer: ResizeObserver; cleanup: (() => void)[] = []; grid: THREE.GridHelper; ground: THREE.Mesh; materialRoughness = .36;
  constructor(host: HTMLDivElement, settings: PaintSettings, onChange: () => void, onPaint: () => void, onPick: (c: string) => void) {
    this.settings = settings; this.onChange = onChange; this.onPaint = onPaint; this.onPick = onPick;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    host.appendChild(this.renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(this.renderer); const room = new RoomEnvironment(); this.scene.environment = pmrem.fromScene(room, .04).texture; room.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa89a84, 2.1));
    const key = new THREE.DirectionalLight(0xfffaf1, 4.2); key.position.set(-3, 7, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 5; key.shadow.camera.bottom = -4; key.shadow.normalBias = .03; key.shadow.radius = 5; this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xe1eaff, 1.3); fill.position.set(4, 3, -2); this.scene.add(fill);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .13 })); this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -.012; this.ground.receiveShadow = true; this.scene.add(this.ground);
    this.grid = new THREE.GridHelper(24, 48, 0xdedbd3, 0xe4e0d8); this.grid.position.y = -.025; (this.grid.material as THREE.Material).transparent = true; (this.grid.material as THREE.Material).opacity = .4; this.scene.add(this.grid);
    this.scene.fog = new THREE.Fog(0xf3f1eb, 11, 23);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = true; this.controls.dampingFactor = .12; this.controls.minDistance = 3.8; this.controls.maxDistance = 15; this.controls.maxPolarAngle = Math.PI * .49; this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }; this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.scene.add(this.model); this.makeVase(); this.resetView();
    this.observer = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }); this.observer.observe(host);
    const el = this.renderer.domElement; el.style.touchAction = 'none';
    const down = (e: PointerEvent) => { if (e.button !== 0 || this.space || this.settings.tool === 'orbit') return; this.controls.enabled = false; this.drawing = true; this.last = null; el.setPointerCapture(e.pointerId); this.paint(e, true); };
    const move = (e: PointerEvent) => { if (this.drawing) { const events = e.getCoalescedEvents?.(); for (const event of events?.length ? events : [e]) this.paint(event, false); } };
    const up = () => { if (this.drawing) this.onPaint(); this.drawing = false; this.last = null; this.controls.enabled = true; };
    const keydown = (e: KeyboardEvent) => { if ((e.target as HTMLElement).matches('input,textarea,select')) return; if (e.code === 'Space') { e.preventDefault(); this.space = true; this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; } };
    const keyup = (e: KeyboardEvent) => { if (e.code === 'Space') { this.space = false; this.setTool(this.settings.tool); } };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    this.cleanup.push(() => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); });
    const render = () => { this.frame = requestAnimationFrame(render); this.controls.update(); this.renderer.render(this.scene, this.camera); }; render();
  }
  makeVase() {
    const profile = [[.02,0],[.62,0],[.7,.05],[.75,.14],[.86,.35],[1.02,.75],[1.09,1.16],[1.05,1.53],[.89,1.88],[.64,2.18],[.49,2.46],[.48,2.76],[.56,2.95],[.58,3.02],[.57,3.06],[.52,3.07],[.50,3.02],[.43,2.77],[.44,2.48],[.60,2.2],[.84,1.88],[.98,1.52],[1.01,1.16],[.93,.76],[.65,.16],[.02,.14]];
    const curve = new THREE.SplineCurve(profile.map(([x,y]) => new THREE.Vector2(x,y)));
    const geo = new THREE.LatheGeometry(curve.getPoints(180), 144);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .36, metalness: .02, side: THREE.DoubleSide })); mesh.name = 'Ceramic vase'; mesh.castShadow = true; mesh.receiveShadow = true; this.model.add(mesh);
    const surface = this.addSurface(mesh, '#eee5d1'); starter(this.getLayerCanvas(surface, 2)); this.composite();
  }
  addSurface(mesh: THREE.Mesh, color = '#f0ece2') {
    const c = canvas(), base = canvas(); const ctx = base.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, SIZE, SIZE);
    const old = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (old instanceof THREE.MeshStandardMaterial) { if (old.map?.image) { try { ctx.drawImage(old.map.image as CanvasImageSource,0,0,SIZE,SIZE); } catch { /* Texture may not be a drawable image. */ } } else if (color === '#f0ece2') { ctx.fillStyle = '#' + old.color.getHexString(); ctx.fillRect(0,0,SIZE,SIZE); } }
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); texture.wrapS = THREE.RepeatWrapping;
    if (old instanceof THREE.MeshStandardMaterial && old.map) texture.flipY = old.map.flipY;
    const material = old instanceof THREE.MeshStandardMaterial ? old.clone() : new THREE.MeshStandardMaterial(); material.map = texture; material.color.set(0xffffff); material.roughness = this.materialRoughness; material.metalness = .02; mesh.material = material;
    const s = { mesh, canvas: c, texture, base, layers: new Map<number, HTMLCanvasElement>() }; this.surfaces.push(s); return s;
  }
  getLayerCanvas(s: Surface, id: number) { if (!s.layers.has(id)) s.layers.set(id, canvas()); return s.layers.get(id)!; }
  composite() {
    for (const s of this.surfaces) { const ctx = s.canvas.getContext('2d')!; ctx.clearRect(0,0,SIZE,SIZE); ctx.globalAlpha = 1; ctx.fillStyle = '#eae7df'; ctx.fillRect(0,0,SIZE,SIZE); for (const l of [...this.layers].reverse()) { if (!l.visible) continue; ctx.globalAlpha = l.opacity / 100; if (l.locked) ctx.drawImage(s.base,0,0); else if (s.layers.has(l.id)) ctx.drawImage(s.layers.get(l.id)!,0,0); } ctx.globalAlpha = 1; s.texture.needsUpdate = true; }
  }
  paint(e: PointerEvent, first: boolean) {
    const bounds = this.renderer.domElement.getBoundingClientRect(); this.pointer.set((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1); this.raycaster.setFromCamera(this.pointer,this.camera);
    const hit = this.raycaster.intersectObjects(this.surfaces.map(s => s.mesh), false)[0]; if (!hit?.uv) { this.last = null; return; }
    const s = this.surfaces.find(s => s.mesh === hit.object)!; const x = hit.uv.x * SIZE, y = (s.texture.flipY ? 1-hit.uv.y : hit.uv.y)*SIZE;
    if (this.settings.tool === 'eyedropper') { const p = s.canvas.getContext('2d')!.getImageData(Math.min(1023, Math.max(0,x)),Math.min(1023,Math.max(0,y)),1,1).data; this.onPick('#' + [p[0],p[1],p[2]].map(v=>v.toString(16).padStart(2,'0')).join('')); return; }
    const l = this.layers.find(l=>l.id===this.activeLayer); if (!l || l.locked || !l.visible) return;
    const ctx = this.getLayerCanvas(s,this.activeLayer).getContext('2d')!;
    if (first || this.last?.surface !== s) { this.undoStack.push({surface:s,layer:this.activeLayer,data:ctx.getImageData(0,0,SIZE,SIZE)}); if(this.undoStack.length>20)this.undoStack.shift(); this.redoStack=[]; }
    const pressure = this.settings.pressure && e.pointerType === 'pen' ? Math.max(.08,e.pressure) : .7;
    const radius = this.settings.size * .62 * (this.settings.pressure ? .4+pressure*.8 : 1);
    let color = this.settings.color;
    if(this.settings.tool==='blend') { const sample = this.last?.surface===s ? this.last : {x,y}; const p=s.canvas.getContext('2d')!.getImageData(Math.min(1023,Math.max(0,sample.x)),Math.min(1023,Math.max(0,sample.y)),1,1).data; color=`rgb(${p[0]},${p[1]},${p[2]})`; }
    const previous = this.last?.surface===s && Math.abs(this.last.x-x)<SIZE*.4 ? this.last : {x,y};
    const distance = Math.hypot(x-previous.x,y-previous.y); const steps = Math.max(1,Math.ceil(distance/Math.max(1,radius*.18)));
    ctx.globalCompositeOperation = this.settings.tool==='erase'?'destination-out':'source-over';
    for(let i=1;i<=steps;i++) { const dx=previous.x+(x-previous.x)*i/steps, dy=previous.y+(y-previous.y)*i/steps; ctx.globalAlpha = this.settings.opacity/100 * this.settings.flow/100 * (.13 + this.settings.viscosity/240); const soft=this.settings.brush==='Airbrush'||this.settings.brush==='Watercolor'||this.settings.tool==='blend';
      if(soft) { const g=ctx.createRadialGradient(dx,dy,0,dx,dy,radius);g.addColorStop(0,color);g.addColorStop(.3,color);g.addColorStop(1,'transparent');ctx.fillStyle=g; } else ctx.fillStyle=color;
      ctx.beginPath(); if(this.settings.brush==='Flat'){ctx.save();ctx.translate(dx,dy);ctx.rotate(-.5);ctx.rect(-radius*.38,-radius,radius*.76,radius*2);ctx.fill();ctx.restore();}else if(this.settings.brush==='Filbert'){ctx.ellipse(dx,dy,radius*.62,radius,-.5,0,Math.PI*2);ctx.fill();}else if(this.settings.brush==='Palette knife'){ctx.moveTo(dx-radius,dy+radius*.3);ctx.lineTo(dx+radius*.8,dy-radius*.55);ctx.lineTo(dx+radius,dy-radius*.25);ctx.lineTo(dx-radius*.8,dy+radius*.55);ctx.closePath();ctx.fill();}else{ctx.arc(dx,dy,radius,0,Math.PI*2);ctx.fill();}
      if(this.settings.wetness>40 && !soft && this.settings.tool!=='erase') {ctx.globalAlpha=.025*this.settings.wetness/100;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();}
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';this.last={x,y,surface:s};this.composite();
  }
  setTool(tool:string) { this.settings.tool=tool; this.controls.mouseButtons.LEFT=tool==='orbit'?THREE.MOUSE.ROTATE:null as unknown as THREE.MOUSE; this.renderer.domElement.style.cursor=tool==='orbit'?'grab':tool==='eyedropper'?'crosshair':'none'; }
  undo(redo=false) {const from=redo?this.redoStack:this.undoStack,to=redo?this.undoStack:this.redoStack;const item=from.pop();if(!item)return false;const ctx=this.getLayerCanvas(item.surface,item.layer).getContext('2d')!;to.push({...item,data:ctx.getImageData(0,0,SIZE,SIZE)});ctx.putImageData(item.data,0,0);this.composite();return true;}
  addLayer(name?:string) {const id=Date.now();this.layers.unshift({id,name:name||`Paint layer ${this.layers.length}`,visible:true,opacity:100});this.activeLayer=id;this.onChange();return id;}
  resetView() {this.camera.position.set(3.2,2.75,5.2);this.controls.target.set(0,1.48,0);this.controls.update();}
  zoom(amount:number) {const d=this.camera.position.clone().sub(this.controls.target);d.multiplyScalar(amount);if(d.length()>3.8&&d.length()<15)this.camera.position.copy(this.controls.target).add(d);}
  setRoughness(v:number) {this.materialRoughness=v;for(const s of this.surfaces)(s.mesh.material as THREE.MeshStandardMaterial).roughness=v;}
  async importGLB(file:File) {const gltf=await new GLTFLoader().parseAsync(await file.arrayBuffer(),'');const group=gltf.scene;let count=0;group.traverse(o=>{if(o instanceof THREE.Mesh && o.geometry.attributes.uv)count++;});if(!count)throw new Error('This model needs UV coordinates before it can be painted.');
    this.model.clear();this.surfaces=[];this.undoStack=[];this.redoStack=[];this.layers=[{id:2,name:'Paint layer 1',visible:true,opacity:100},{id:1,name:'Original material',visible:true,opacity:100,locked:true}];this.activeLayer=2;
    const box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const scale=3.05/Math.max(size.x,size.y,size.z);group.scale.multiplyScalar(scale);group.position.sub(center.multiplyScalar(scale));group.position.y+=size.y*scale/2;
    group.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;if(o.geometry.attributes.uv)this.addSurface(o);}});this.model.add(group);this.composite();this.resetView();this.onChange();
  }
  async exportGLB() {this.composite();return new GLTFExporter().parseAsync(this.model,{binary:true,maxTextureSize:SIZE});}
  applyImage(image:HTMLImageElement) {this.addLayer('Image color study');for(const s of this.surfaces){const ctx=this.getLayerCanvas(s,this.activeLayer).getContext('2d')!;const small=document.createElement('canvas');small.width=small.height=48;small.getContext('2d')!.drawImage(image,0,0,48,48);ctx.imageSmoothingEnabled=true;ctx.drawImage(small,0,0,SIZE,SIZE);}this.composite();this.onPaint();}
  screenshot(){this.renderer.render(this.scene,this.camera);return this.renderer.domElement.toDataURL('image/png');}
  dispose(){cancelAnimationFrame(this.frame);this.observer.disconnect();this.cleanup.forEach(f=>f());this.controls.dispose();this.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});this.surfaces.forEach(s=>s.texture.dispose());this.scene.environment?.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
