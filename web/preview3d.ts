import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface OverlayInfo {
  /** Ball radius in mm. */
  R: number;
  /** Half-width of the output along the rotation axis in mm. */
  xMax: number;
  theta0: number;
  thetaSpan: number;
  /** Latitude limit in degrees from the equator along the rotation axis. */
  latitudeLimitDeg: number;
}

/** Orbitable 3D ball showing the engraved result wrapped on its surface. */
export class BallPreview {
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 1, 2000);
  private controls: OrbitControls;
  private ball: THREE.Mesh | null = null;
  private overlay: THREE.Mesh | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private limit: THREE.Group | null = null;
  private showLimit = true;
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

  update(info: OverlayInfo, textureCanvas: HTMLCanvasElement): void {
    if (info.R !== this.radius) this.rebuildBall(info.R);
    this.rebuildOverlay(info, textureCanvas);
    this.rebuildLimit(info.R, info.latitudeLimitDeg);
    this.render();
  }

  setLimitVisible(visible: boolean): void {
    this.showLimit = visible;
    if (this.limit) this.limit.visible = visible;
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
    if (first) this.camera.position.set(0, 0, R * 4.2);
    this.controls.minDistance = R * 1.6;
    this.controls.maxDistance = R * 10;
  }

  private rebuildOverlay(info: OverlayInfo, canvas: HTMLCanvasElement): void {
    if (this.overlay) {
      this.overlay.geometry.dispose();
      (this.overlay.material as THREE.Material).dispose();
      this.scene.remove(this.overlay);
    }
    this.texture?.dispose();
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const R = info.R * 1.002; // sit just above the ball surface
    const N = 64;
    const M = Math.max(8, Math.min(256, Math.ceil((Math.abs(info.thetaSpan) / (2 * Math.PI)) * 256)));
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= M; j++) {
      const theta = info.theta0 + (j / M) * info.thetaSpan;
      for (let i = 0; i <= N; i++) {
        const x = -info.xMax + (2 * info.xMax * i) / N;
        // keep every vertex exactly on the sphere of radius R
        const phi = Math.asin(Math.max(-1, Math.min(1, x / info.R)));
        const r = R * Math.cos(phi);
        pos.push(R * Math.sin(phi), -r * Math.sin(theta), r * Math.cos(theta));
        uv.push(i / N, 1 - j / M);
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
    this.overlay = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        map: this.texture,
        transparent: true,
        roughness: 0.4,
        metalness: 0.1,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    this.scene.add(this.overlay);
  }

  /** Tinted caps beyond the latitude limit (spot elongates and defocuses there) plus a ring at each limit. */
  private rebuildLimit(R: number, limitDeg: number): void {
    if (this.limit) {
      this.limit.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
      this.scene.remove(this.limit);
    }
    const lim = (limitDeg * Math.PI) / 180;
    const group = new THREE.Group();
    group.visible = this.showLimit;
    const rr = R * 1.004;
    const capLen = Math.PI / 2 - lim;
    const tint = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    if (capLen > 0.001) {
      // SphereGeometry's poles lie on local Y; the group is rotated below so they lie on the rotation axis (X)
      group.add(new THREE.Mesh(new THREE.SphereGeometry(rr, 96, 16, 0, Math.PI * 2, 0, capLen), tint));
      group.add(new THREE.Mesh(new THREE.SphereGeometry(rr, 96, 16, 0, Math.PI * 2, Math.PI - capLen, capLen), tint.clone()));
    }
    const ringMat = new THREE.LineBasicMaterial({ color: 0xff3b30 });
    for (const sign of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(rr * Math.cos(lim) * Math.cos(a), sign * rr * Math.sin(lim), rr * Math.cos(lim) * Math.sin(a)));
      }
      group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
    }
    group.rotation.z = -Math.PI / 2; // local +Y -> world +X
    this.limit = group;
    this.scene.add(group);
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
