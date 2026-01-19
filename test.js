/*
StarFox-style animated mini demo using CanvasRenderingContext2D only (no libraries). The scene renders
a Mode-7 scanline ground into an ImageData buffer each frame and draws a simple ship using a small
software 3D pipeline (model/view transforms, perspective projection, triangle rasterisation, z-buffer).
Gates spawn ahead and move toward the player; flying through them increases score, collisions reduce
health, and the system resets on R. Controls: Arrow Left/Right turn, Arrow Up/Down change speed,
A/D strafe, W/S camera height, Space boost, R restart. Everything animates continuously via
requestAnimationFrame using delta-time for stable motion and consistent gameplay.
*/

(() => {
  // ============================================================================
  // STAGE 0 — Skeleton + rAF loop helpers
  //  - We will later call update(dt) and render() inside requestAnimationFrame.
  // ============================================================================
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ============================================================================
  // STAGE 1 — Fixed-resolution framebuffer (ImageData + Uint32 view for speed)
  //  - Writing pixels into data32[] is like a tiny software renderer.
  // ============================================================================
  function packRGBA(r, g, b, a = 255) {
    // Little-endian Uint32 packed color (matches ImageData RGBA byte layout)
    return (a << 24) | (b << 16) | (g << 8) | r;
  }

  // ============================================================================
  // STAGE 4 — Input system (interaction marks)
  //  - Track keys held and keys pressed this frame ("edge trigger").
  // ============================================================================
  class Input {
    constructor() {
      this.down = new Set();
      this.pressed = new Set();

      // Prevent arrow keys scrolling page
      window.addEventListener("keydown", (e) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) {
          e.preventDefault();
        }
        if (!this.down.has(e.code)) this.pressed.add(e.code);
        this.down.add(e.code);
      }, { passive: false });

      window.addEventListener("keyup", (e) => this.down.delete(e.code));
    }
    isDown(code) { return this.down.has(code); }
    wasPressed(code) { return this.pressed.has(code); }
    endFrame() { this.pressed.clear(); }
  }

  // ============================================================================
  // STAGE 2 — Procedural texture (no external assets)
  // STAGE 3 — Mode-7 floor (scanline plane mapping)
  //  - Each scanline maps to a row on a ground plane.
  // ============================================================================
  class Mode7Floor {
    constructor(W, H) {
      this.W = W; this.H = H;
      this.horizon = (H * 0.42) | 0;

      this.TEX = 256;
      this.tex = new Uint32Array(this.TEX * this.TEX);
      this.buildProceduralTexture(); // STAGE 2
    }

    buildProceduralTexture() {
      const T = this.TEX;
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          const gx = (x & 31) === 0;
          const gy = (y & 31) === 0;
          const checker = ((x >> 4) ^ (y >> 4)) & 1;

          let r = 20, g = 140, b = 120;
          if (checker) { r += 10; g += 10; b += 10; }
          if (gx || gy) { r = 220; g = 240; b = 255; } // grid lines

          const n = ((x * 1103515245 + y * 12345) >>> 0) & 15;
          r = Math.min(255, r + n);
          g = Math.min(255, g + (n >> 1));
          b = Math.min(255, b + (n >> 2));

          this.tex[y * T + x] = packRGBA(r, g, b, 255);
        }
      }
    }

    render(data32, cam) {
      const W = this.W, H = this.H;
      const horizon = this.horizon;

      // Sky gradient (cheap but effective depth)
      for (let y = 0; y < horizon; y++) {
        const t = y / horizon;
        const c = packRGBA((10 + 20 * t) | 0, (18 + 30 * t) | 0, (40 + 70 * t) | 0, 255);
        const row = y * W;
        for (let x = 0; x < W; x++) data32[row + x] = c;
      }

      // Starfield (keeps "always animating" even if not moving)
      const starCount = 260;
      for (let i = 0; i < starCount; i++) {
        const sx = (i * 97 + (cam.time * 40) | 0) % W;
        const sy = (i * 53 + (cam.time * 22) | 0) % horizon;
        data32[sy * W + sx] = packRGBA(220, 240, 255, 255);
      }

      // ---- Mode-7: project ground plane per scanline ----
      const sin = Math.sin(cam.yaw);
      const cos = Math.cos(cam.yaw);

      const fx = cos, fz = sin;   // forward vector on XZ
      const rx = -sin, rz = cos;  // right vector on XZ

      const camH = cam.height;
      const scale = 140;
      const fov = 1.1;
      const T = this.TEX;

      for (let y = horizon; y < H; y++) {
        const dy = (y - horizon) + 0.0001;
        const dist = (camH * scale) / dy;
        const halfW = dist * fov;

        let wx = cam.x + fx * dist - rx * halfW;
        let wz = cam.z + fz * dist - rz * halfW;

        const stepX = (rx * (2 * halfW)) / W;
        const stepZ = (rz * (2 * halfW)) / W;

        const fog = Math.min(1, dist / 900);
        const fr = (20 + 15 * fog) | 0;
        const fg = (30 + 40 * fog) | 0;
        const fb = (45 + 55 * fog) | 0;

        const row = y * W;
        for (let x = 0; x < W; x++) {
          const u = ((wx | 0) & (T - 1));
          const v = ((wz | 0) & (T - 1));
          const col = this.tex[v * T + u];

          const r = (col & 255);
          const g = (col >> 8) & 255;
          const b = (col >> 16) & 255;

          data32[row + x] = packRGBA(
            (r * (1 - fog) + fr * fog) | 0,
            (g * (1 - fog) + fg * fog) | 0,
            (b * (1 - fog) + fb * fog) | 0,
            255
          );

          wx += stepX;
          wz += stepZ;
        }
      }
    }
  }

  // ============================================================================
  // STAGE 5 — 3D pipeline math (matrices and transforms)
  // ============================================================================
  function matIdentity() {
    const m = new Float32Array(16);
    m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
    return m;
  }
  function matMul(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }
  function matTranslate(tx, ty, tz) {
    const m = matIdentity();
    m[12] = tx; m[13] = ty; m[14] = tz;
    return m;
  }
  function matRotateY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const m = matIdentity();
    m[0] = c; m[8] = s;
    m[2] = -s; m[10] = c;
    return m;
  }
  function matRotateX(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const m = matIdentity();
    m[5] = c; m[9] = -s;
    m[6] = s; m[10] = c;
    return m;
  }
  function transformPoint(m, x, y, z) {
    const tx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const ty = m[1] * x + m[5] * y + m[9] * z + m[13];
    const tz = m[2] * x + m[6] * y + m[10] * z + m[14];
    const tw = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [tx, ty, tz, tw];
  }

  // ============================================================================
  // STAGE 8 — Triangle rasteriser helpers
  // STAGE 9 — Z-buffer test inside the rasteriser
  // ============================================================================
  function edge(ax, ay, bx, by, cx, cy) {
    return (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
  }

  class SoftRenderer3D {
    constructor(W, H, data32, zbuf) {
      this.W = W; this.H = H;
      this.data32 = data32;
      this.zbuf = zbuf;

      // STAGE 7 — Projection parameters
      this.fovPx = 260;
      this.cx = W * 0.5;
      this.cy = H * 0.50;
    }

    clearZ() { this.zbuf.fill(1e9); } // STAGE 9

    project(p) { // STAGE 7
      const x = (p[0] / p[2]) * this.fovPx + this.cx;
      const y = (p[1] / p[2]) * -this.fovPx + this.cy;
      return [x, y, p[2]];
    }

    drawTriSolid(v0, v1, v2, color) { // STAGE 8 + STAGE 9
      const W = this.W, H = this.H;
      const data32 = this.data32, zbuf = this.zbuf;

      let x0 = v0[0], y0 = v0[1], z0 = v0[2];
      let x1 = v1[0], y1 = v1[1], z1 = v1[2];
      let x2 = v2[0], y2 = v2[1], z2 = v2[2];

      // backface cull in screen space (cheap)
      const area = edge(x0, y0, x1, y1, x2, y2);
      if (area >= 0) return;

      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));

      const invArea = 1 / area;

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5, py = y + 0.5;

          const w0 = edge(x1, y1, x2, y2, px, py) * invArea;
          const w1 = edge(x2, y2, x0, y0, px, py) * invArea;
          const w2 = 1 - w0 - w1;

          if (w0 >= 0 && w1 >= 0 && w2 >= 0) {
            const z = w0 * z0 + w1 * z1 + w2 * z2;
            const idx = y * W + x;

            // Z-test (STAGE 9)
            if (z < zbuf[idx]) {
              zbuf[idx] = z;
              data32[idx] = color;
            }
          }
        }
      }
    }
  }

  // ============================================================================
  // STAGE 6 — Arrays for vertices + triangle indices (ship mesh)
  // ============================================================================
  class Ship {
    constructor() {
      this.strafe = 0;
      this.speed = 7.5;
      this.health = 100;
      this.score = 0;
      this.boost = 1;
      this.boosting = false;

      // Vertex buffer: [x,y,z, x,y,z, ...]
      this.verts = [
         0,  0.12,  0.35,  // 0
         0, -0.10,  0.35,  // 1
        -0.18, 0.00, -0.10,// 2
         0.18, 0.00, -0.10,// 3
         0,  0.06, -0.25,  // 4
         0, -0.06, -0.25,  // 5
      ];

      // Index buffer (triangles)
      this.tris = [
        [0, 2, 3], [1, 3, 2],
        [0, 3, 4], [0, 4, 2],
        [1, 2, 5], [1, 5, 3],
        [2, 4, 5], [3, 5, 4],
      ];
    }
  }

  // ============================================================================
  // STAGE 11 — Game objects (gates) + array + spawn timer
  // ============================================================================
  class Gate {
    constructor(x, z, w = 1.25) {
      this.x = x;    // lateral position
      this.z = z;    // distance in front of player
      this.w = w;    // pass width
      this.passed = false;
      this.hit = false;
    }
  }

  // ============================================================================
  // STAGE 10 — Lighting (simple diffuse per triangle)
  // STAGE 12 — Gameplay loop: collisions, scoring, restart
  // ============================================================================
  class Game {
    constructor(canvas, hudEl) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.hudEl = hudEl;

      this.W = canvas.width;
      this.H = canvas.height;

      // STAGE 1 setup: framebuffer
      this.img = this.ctx.createImageData(this.W, this.H);
      this.data32 = new Uint32Array(this.img.data.buffer);
      this.zbuf = new Float32Array(this.W * this.H);

      // Systems
      this.input = new Input();             // STAGE 4
      this.floor = new Mode7Floor(this.W, this.H); // STAGE 2 + 3
      this.r3d = new SoftRenderer3D(this.W, this.H, this.data32, this.zbuf); // STAGE 5..9

      // Camera state (STAGE 4)
      this.cam = { x: 0, z: 0, yaw: 0, height: 1.25, time: 0 };

      this.ship = new Ship(); // STAGE 6
      this.gates = [];        // STAGE 11
      this.spawnTimer = 0;

      this.reset();
    }

    reset() { // STAGE 12
      this.cam.x = 0; this.cam.z = 0; this.cam.yaw = 0; this.cam.height = 1.25;
      this.ship.strafe = 0;
      this.ship.speed = 7.5;
      this.ship.health = 100;
      this.ship.score = 0;
      this.ship.boost = 1;
      this.gates.length = 0;
      this.spawnTimer = 0;
    }

    spawnGate() { // STAGE 11
      const lateral = (Math.random() * 2 - 1) * 2.5;
      const forward = 26 + Math.random() * 12;
      this.gates.push(new Gate(lateral, forward));
    }

    update(dt) { // STAGE 4 + 11 + 12
      const inp = this.input;

      // Restart
      if (inp.wasPressed("KeyR")) this.reset();

      // Turning
      const turnRate = 1.6;
      if (inp.isDown("ArrowLeft")) this.cam.yaw -= turnRate * dt;
      if (inp.isDown("ArrowRight")) this.cam.yaw += turnRate * dt;

      // Speed control
      if (inp.isDown("ArrowUp")) this.ship.speed = clamp(this.ship.speed + 6.0 * dt, 4.0, 16.0);
      if (inp.isDown("ArrowDown")) this.ship.speed = clamp(this.ship.speed - 6.0 * dt, 4.0, 16.0);

      // Strafe
      const strafeRate = 3.2;
      if (inp.isDown("KeyA")) this.ship.strafe -= strafeRate * dt;
      if (inp.isDown("KeyD")) this.ship.strafe += strafeRate * dt;
      this.ship.strafe = clamp(this.ship.strafe, -4.0, 4.0);

      // Camera height for Mode-7 look
      if (inp.isDown("KeyW")) this.cam.height = Math.min(3.0, this.cam.height + 1.2 * dt);
      if (inp.isDown("KeyS")) this.cam.height = Math.max(0.6, this.cam.height - 1.2 * dt);

      // Boost (Space)
      this.ship.boosting = inp.isDown("Space") && this.ship.boost > 0.05;
      if (this.ship.boosting) this.ship.boost = Math.max(0, this.ship.boost - 0.55 * dt);
      else this.ship.boost = Math.min(1, this.ship.boost + 0.22 * dt);

      const boostMul = this.ship.boosting ? 1.75 : 1.0;

      // Move forward on the ground plane
      const fx = Math.cos(this.cam.yaw), fz = Math.sin(this.cam.yaw);
      this.cam.x += fx * this.ship.speed * boostMul * dt;
      this.cam.z += fz * this.ship.speed * boostMul * dt;

      // Spawning gates
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnGate();
        this.spawnTimer = 0.9;
      }

      // Move gates "toward" player by reducing their z-distance
      for (const g of this.gates) g.z -= this.ship.speed * boostMul * dt;

      // Collision / scoring when gates reach player zone
      const shipX = this.ship.strafe;
      for (const g of this.gates) {
        if (!g.passed && g.z < 0.7) {
          g.passed = true;
          const ok = Math.abs(shipX - g.x) < g.w;
          if (ok) this.ship.score += 10;
          else { this.ship.health = Math.max(0, this.ship.health - 15); g.hit = true; }
        }
      }

      // Cleanup
      this.gates = this.gates.filter(g => g.z > -5);

      inp.endFrame();
    }

    // STAGE 10 — per-triangle lighting + STAGE 5..9 pipeline usage
    renderShip() {
      const shipDist = 2.2;
      const sx = this.cam.x + Math.cos(this.cam.yaw) * shipDist;
      const sz = this.cam.z + Math.sin(this.cam.yaw) * shipDist;
      const sy = 0.55;

      // apply strafe in camera right direction
      const rx = -Math.sin(this.cam.yaw), rz = Math.cos(this.cam.yaw);
      const shipWX = sx + rx * this.ship.strafe;
      const shipWZ = sz + rz * this.ship.strafe;

      // Ship wobble
      const shipYaw = this.cam.yaw + Math.sin(this.cam.time * 0.8) * 0.12;
      const shipPitch = Math.sin(this.cam.time * 1.2) * 0.06;

      // Model and View matrices
      const M = matMul(matTranslate(shipWX, sy, shipWZ), matMul(matRotateY(shipYaw), matRotateX(shipPitch)));
      const V = matMul(matRotateY(-this.cam.yaw), matTranslate(-this.cam.x, -this.cam.height * 0.15, -this.cam.z));
      const MVP = matMul(V, M);

      // Transform vertices to camera space
      const vCam = [];
      for (let i = 0; i < this.ship.verts.length; i += 3) {
        vCam.push(transformPoint(MVP, this.ship.verts[i], this.ship.verts[i + 1], this.ship.verts[i + 2]));
      }

      // Lighting setup
      const lightDir = [0.2, 0.6, 0.7];
      const lightLen = Math.hypot(lightDir[0], lightDir[1], lightDir[2]);

      for (const tri of this.ship.tris) {
        const a = vCam[tri[0]], b = vCam[tri[1]], c = vCam[tri[2]];
        if (a[2] <= 0.2 || b[2] <= 0.2 || c[2] <= 0.2) continue;

        // Normal from cross product in camera space
        const ax = a[0], ay = a[1], az = a[2];
        const bx = b[0], by = b[1], bz = b[2];
        const cx = c[0], cy = c[1], cz = c[2];

        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;

        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;

        const nLen = Math.hypot(nx, ny, nz) + 1e-6;
        const ndotl = Math.max(0, (nx * lightDir[0] + ny * lightDir[1] + nz * lightDir[2]) / (nLen * lightLen));

        const shade = 0.25 + 0.85 * ndotl;
        const baseR = 200, baseG = 70, baseB = 255;
        const col = packRGBA((baseR * shade) | 0, (baseG * shade) | 0, (baseB * shade) | 0, 255);

        // Project and rasterise
        this.r3d.drawTriSolid(
          this.r3d.project(a),
          this.r3d.project(b),
          this.r3d.project(c),
          col
        );
      }
    }

    // STAGE 11 — Gates rendered as “billboards” in Canvas2D (simple + readable)
    renderGatesOverlay() {
      const W = this.W, H = this.H;
      const horizon = this.floor.horizon;

      for (const g of this.gates) {
        const z = Math.max(0.4, g.z);

        const scale = 180 / z;
        const x = (W * 0.5) + (g.x - this.ship.strafe) * scale * 0.35;
        const y = lerp(horizon + 20, H - 10, 1 - Math.min(1, z / 30));
        const w = g.w * scale;
        const h = 0.9 * scale;

        this.ctx.strokeStyle = g.hit ? "rgba(255,80,80,0.9)" : "rgba(80,255,220,0.9)";
        this.ctx.lineWidth = Math.max(1, scale * 0.01);
        this.ctx.strokeRect(x - w, y - h, w * 2, h * 2);

        this.ctx.strokeStyle = "rgba(255,255,255,0.25)";
        this.ctx.strokeRect(x - w * 0.75, y - h * 0.75, w * 1.5, h * 1.5);
      }
    }

    renderHUD() {
      const s = this.ship;
      this.hudEl.textContent =
        `Score: ${s.score}   Health: ${s.health}   Speed: ${s.speed.toFixed(1)}   Boost: ${(s.boost * 100 | 0)}%   Gates: ${this.gates.length}`;
    }

    render() {
      // Background into framebuffer (Mode-7)
      this.r3d.clearZ();
      this.floor.render(this.data32, this.cam);
      this.ctx.putImageData(this.img, 0, 0);

      // Overlay gates using Canvas2D
      this.renderGatesOverlay();

      // Ship via software rasteriser into framebuffer, then blit on top
      this.renderShip();
      this.ctx.putImageData(this.img, 0, 0);

      // HUD
      this.renderHUD();
    }
  }

  // ============================================================================
  // STAGE 0 + STAGE 1 — Bootstrapping + running in rAF
  // ============================================================================
  const canvas = document.getElementById("c");
  const hud = document.getElementById("hud");

  // Optional CSS scaling (pixelated look)
  function resizeCSS() {
    const W = canvas.width, H = canvas.height;
    const s = Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H));
    canvas.style.width = (W * Math.max(1, s)) + "px";
    canvas.style.height = (H * Math.max(1, s)) + "px";
  }
  window.addEventListener("resize", resizeCSS);
  resizeCSS();

  const game = new Game(canvas, hud);

  let lastT = performance.now();
  function frame(t) {
    // dt = delta-time in seconds (stable movement)
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;

    game.cam.time = t / 1000;
    game.update(dt);
    game.render();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
