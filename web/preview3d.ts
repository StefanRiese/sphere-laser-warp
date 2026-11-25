import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface OverlayInfo {
  /** Ball radius in mm. */
  R: number;
  /** Axis position (mm from the ball centre) of the output's left edge, and its width in mm. */
  xStart: number;
  widthMm: number;
  theta0: number;
  thetaSpan: number;
}

/** The original, unwarped image as it would be engraved if imported into the rotary as is. */
export interface NaiveInfo {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  widthMm: number;
  heightMm: number;
  offsetAxisMm: number;
}

/** Orbitable 3D ball showing the engraved result wrapped on its surface. */
export class BallPreview {
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 1, 2000);
  private controls: OrbitControls;
  private ball: THREE.Mesh | null = null;
  private warpMesh: THREE.Mesh | null = null;
  private naiveMesh: THREE.Mesh | null = null;
  private mode: 'warp' | 'naive' = 'warp';
  private labels = { plus: 'axis +', minus: 'axis -', turns: 'ball turns' };
  private axisR: number | null = null;
  private axis: THREE.Group | null = null;
  private showAxis = true;
  private color = '#9b1c1c';
  private radius = 0;
  private raf = 0;

  constructor(private el: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-1, 1.5, 2);
    this.camera.add(sun);
    this.scene.add(this.camera);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.addEventListener('change', () => this.render());
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.controls.update();
    };
    tick();
  }

  setBallColor(hex: string): void {
    this.color = hex;
    (this.ball?.material as THREE.MeshStandardMaterial | undefined)?.color.set(hex);
    this.render();
  }

  update(info: OverlayInfo, textureCanvas: HTMLCanvasElement, naive: NaiveInfo | null): void {
    if (info.R !== this.radius) this.rebuildBall(info.R);
    this.disposePatch(this.warpMesh);
    this.warpMesh = this.makePatch(info.R, {
      xa: info.xStart, xb: info.xStart + info.widthMm, theta0: info.theta0, thetaSpan: info.thetaSpan,
      canvas: textureCanvas,
    });
    this.disposePatch(this.naiveMesh);
    this.naiveMesh = null;
    if (naive) {
      // a cylinder-style rotary maps the file's height onto the circumference of a ball-diameter cylinder
      const span = naive.heightMm / info.R;
      this.naiveMesh = this.makePatch(info.R, {
        xa: naive.offsetAxisMm - naive.widthMm / 2, xb: naive.offsetAxisMm + naive.widthMm / 2,
        theta0: -span / 2, thetaSpan: span,
        canvas: naive.canvas,
      });
    }
    this.applyMode();
    this.axisR = info.R;
    this.rebuildAxis(info.R);
    this.render();
  }

  setMode(mode: 'warp' | 'naive'): void {
    this.mode = mode;
    this.applyMode();
    this.render();
  }

  private applyMode(): void {
    if (this.warpMesh) this.warpMesh.visible = this.mode === 'warp';
    if (this.naiveMesh) this.naiveMesh.visible = this.mode === 'naive';
  }

  /** Translated texts for the axis labels; rebuilds them if the axis is already shown. */
  setLabels(l: { plus: string; minus: string; turns: string }): void {
    this.labels = l;
    if (this.axisR !== null) this.rebuildAxis(this.axisR);
    this.render();
  }

  setAxisVisible(visible: boolean): void {
    this.showAxis = visible;
    if (this.axis) this.axis.visible = visible;
    this.render();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private rebuildBall(R: number): void {
    const first = this.radius === 0;
    this.radius = R;
    if (this.ball) {
      this.ball.geometry.dispose();
      (this.ball.material as THREE.Material).dispose();
      this.scene.remove(this.ball);
    }
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.25, metalness: 0.35 }),
    );
    this.scene.add(this.ball);
    if (first) this.camera.position.set(R * 0.6, R * 0.5, R * 4.6);
    this.controls.minDistance = R * 1.6;
    this.controls.maxDistance = R * 12;
  }

  private disposePatch(m: THREE.Mesh | null): void {
    if (!m) return;
    m.geometry.dispose();
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.scene.remove(m);
  }

  /**
   * A textured patch on the sphere. The texture spans axis positions [xa, xb] (mm) and rotation angles
   * theta0 .. theta0 + thetaSpan; parts beyond the visible ball are cropped, not squeezed.
   */
  private makePatch(
    R0: number,
    o: { xa: number; xb: number; theta0: number; thetaSpan: number; canvas: HTMLCanvasElement | OffscreenCanvas },
  ): THREE.Mesh {
    const texture = new THREE.CanvasTexture(o.canvas as HTMLCanvasElement);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const R = R0 * 1.002; // sit just above the ball surface
    const clampX = R0 * 0.995;
    const uA = Math.max(0, (-clampX - o.xa) / (o.xb - o.xa));
    const uB = Math.min(1, (clampX - o.xa) / (o.xb - o.xa));
    const abs = Math.abs(o.thetaSpan);
    const crop = abs > 2 * Math.PI ? (abs - 2 * Math.PI) / (2 * abs) : 0;
    const vA = crop;
    const vB = 1 - crop;
    const N = 64;
    const M = Math.max(8, Math.min(256, Math.ceil(((abs * (vB - vA)) / (2 * Math.PI)) * 256)));
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= M; j++) {
      const v = vA + ((vB - vA) * j) / M;
      const theta = o.theta0 + v * o.thetaSpan;
      for (let i = 0; i <= N; i++) {
        const u = uA + ((uB - uA) * i) / N;
        const x = o.xa + u * (o.xb - o.xa);
        // keep every vertex exactly on the sphere of radius R
        const phi = Math.asin(Math.max(-1, Math.min(1, x / R0)));
        const r = R * Math.cos(phi);
        pos.push(R * Math.sin(phi), -r * Math.sin(theta), r * Math.cos(theta));
        uv.push(u, 1 - v);
      }
    }
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i;
        const b = a + N + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        roughness: 0.4,
        metalness: 0.1,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    this.scene.add(mesh);
    return mesh;
  }

  private static disposeGroup(g: THREE.Object3D): void {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as (THREE.Material & { map?: THREE.Texture | null }) | undefined;
      mat?.map?.dispose();
      mat?.dispose();
    });
  }

  private label(text: string, R: number): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(text, 160, 32);
    g.fillStyle = '#fff';
    g.fillText(text, 160, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(R * 1.1, R * 0.22, 1);
    sp.renderOrder = 10;
    return sp;
  }

  /** The rotation axis (X) with end arrows and labels, plus an arrow showing the rotation direction. */
  private rebuildAxis(R: number): void {
    if (this.axis) {
      BallPreview.disposeGroup(this.axis);
      this.scene.remove(this.axis);
    }
    const g = new THREE.Group();
    g.visible = this.showAxis;
    const axisMat = new THREE.MeshBasicMaterial({ color: 0x2f80ed });
    const rotMat = new THREE.MeshBasicMaterial({ color: 0xffa31a });
    const L = R * 1.5;
    const t = R * 0.012;

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(t, t, 2 * L, 12), axisMat);
    shaft.rotation.z = Math.PI / 2; // cylinder's Y -> X
    g.add(shaft);
    for (const s of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(R * 0.045, R * 0.14, 16), axisMat);
      cone.position.x = s * (L + R * 0.05);
      cone.rotation.z = -s * (Math.PI / 2); // tip points away from the ball
      g.add(cone);
      const lab = this.label(s > 0 ? this.labels.plus : this.labels.minus, R);
      lab.position.set(s * (L + R * 0.45), R * 0.14, 0);
      g.add(lab);
    }

    // rotation direction: arc around the axis beyond the + end, running the way the ball's surface moves.
    // File rows advance in increasing theta, i.e. the point under the beam has theta = progress, so the
    // material moves toward decreasing circle angle: surface point = (x, -r sin(theta), r cos(theta)).
    const x0 = L - R * 0.35;
    const rho = R * 0.42;
    const pts: THREE.Vector3[] = [];
    const steps = 48;
    const span = Math.PI * 1.5;
    for (let i = 0; i <= steps; i++) {
      const th = -(i / steps) * span;
      pts.push(new THREE.Vector3(x0, -rho * Math.sin(th), rho * Math.cos(th)));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, t * 1.4, 8), rotMat));
    const tip = pts[pts.length - 1]!;
    const dir = tip.clone().sub(pts[pts.length - 2]!).normalize();
    const head = new THREE.Mesh(new THREE.ConeGeometry(R * 0.05, R * 0.13, 16), rotMat);
    head.position.copy(tip);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(head);
    const rl = this.label(this.labels.turns, R);
    rl.position.set(x0, rho + R * 0.18, 0);
    g.add(rl);

    this.axis = g;
    this.scene.add(g);
  }

  private resize(): void {
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
