// vfx.js
import { v3, clamp } from "./supportMathFuncs.js";
import { worldToCamera, project3D } from "./supportMathFuncs.js";

export const vfx = []; // active effects

// Screen transition state
export let screenTransition = null;

export function startScreenTransition(duration = 0.8) {
    screenTransition = {
        t: 0,
        duration: duration,
        progress: 0
    };
}

// Simple colored particle frames 
export const EXPLO_FRAMES = (() => {
    const frames = [];
    const sizes = [8, 16, 24, 32, 40, 48, 56, 64];
    for (let sIdx = 0; sIdx < sizes.length; sIdx++) {
        const sz = sizes[sIdx];
        const w = sz, h = sz;
        const px = new Uint32Array(w * h);
        const cx = w * 0.5, cy = h * 0.5;
        const radius = sz * 0.45;
        const progress = sIdx / (sizes.length - 1); // 0 to 1
        
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const dx = x - cx, dy = y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Fade based on distance
                let alpha = Math.max(0, 1 - (dist / radius));
                
                // Add starburst pattern
                const angle = Math.atan2(dy, dx);
                const angleNorm = (angle / Math.PI + 1) * 0.5; // 0 to 1
                const pointiness = Math.sin(angleNorm * 8) * 0.3 + 0.7; // Makes it spiky
                alpha *= pointiness;
                
                // Vary color based on animation progress
                // Early: yellow/orange, late: red
                let r, g, b;
                if (progress < 0.5) {
                    // Yellow to orange
                    const t = progress * 2; // 0 to 1
                    r = Math.floor(255);
                    g = Math.floor(200 - t * 100);
                    b = Math.floor(0);
                } else {
                    // Orange to red
                    const t = (progress - 0.5) * 2; // 0 to 1
                    r = Math.floor(255);
                    g = Math.floor(100 - t * 100);
                    b = Math.floor(0);
                }
                
                const alphaInt = Math.floor(alpha * 255);
                const color = (alphaInt << 24) | (b << 16) | (g << 8) | r;
                px[y * w + x] = color;
            }
        }
        frames.push({ w, h, px });
    }
    return frames;
})();

export function spawnExplosion(posWorld, opts = {}) {
    vfx.push({
        type: "explosion",
        pos: v3(posWorld.x, posWorld.y, posWorld.z),
        t: 0,
        life: opts.life ?? 0.45,
        size: opts.size ?? 28,   // pixels at z≈some reference; will be scaled by depth anyway 
                            /*
                                    ⠀                       ╱|、
                                                           (˚ˎ。7  
                                                            |、˜〵          
                                                            じしˍ,)ノ
                            */
        seed: (Math.random() * 1e9) | 0,
    });
}

// vfxRender.js
export function updateVFX(dt) {
  // Update screen transition
  if (screenTransition) {
    screenTransition.t += dt;
    screenTransition.progress = Math.min(1, screenTransition.t / screenTransition.duration);
    if (screenTransition.progress >= 1) {
      screenTransition = null;
    }
  }
  
  for (let i = vfx.length - 1; i >= 0; i--) {
    vfx[i].t += dt;
    if (vfx[i].t >= vfx[i].life) vfx.splice(i, 1);
  }
}

// Draw into world buffer to be occluded by z-buffered geometry
export function drawVFX_World(WOBuffer32, zbuf, canvasW, canvasH, cam, fovPx, cx, cy) {
  if (!EXPLO_FRAMES) return;

  for (let i = 0; i < vfx.length; i++) {
    const fx = vfx[i];
    if (fx.type !== "explosion") continue;

    // world -> camera
    const pc = worldToCamera(fx.pos, cam);
    if (pc.z <= 0.2) continue;

    // camera -> screen
    const sp = project3D(pc, fovPx, cx, cy);
    const sx = sp.x, sy = sp.y;

    // animation frame
    const u = clamp(fx.t / fx.life, 0, 0.9999);
    const frameIndex = (u * EXPLO_FRAMES.length) | 0;
    const frame = EXPLO_FRAMES[frameIndex];

    // perspective scale: tune factor
    const scale = (fx.size / pc.z);
    const drawW = Math.max(2, (frame.w * scale) | 0);
    const drawH = Math.max(2, (frame.h * scale) | 0);

    blitSpriteZ(
      WOBuffer32, zbuf, canvasW, canvasH,
      frame,
      sx - drawW * 0.5,
      sy - drawH * 0.5,
      drawW, drawH,
      pc.z
    );
  }
}

function blitSpriteZ(dst32, zbuf, W, H, sprite, x0, y0, w, h, z) {
    const sxW = sprite.w, sxH = sprite.h;
    const src = sprite.px;

    const ix0 = Math.max(0, x0 | 0);
    const iy0 = Math.max(0, y0 | 0);
    const ix1 = Math.min(W, (x0 + w) | 0);
    const iy1 = Math.min(H, (y0 + h) | 0);

    for (let y = iy0; y < iy1; y++) {
        const ty = (y - y0) / h;
        const sy = clamp((ty * sxH) | 0, 0, sxH - 1);

        for (let x = ix0; x < ix1; x++) {
            const tx = (x - x0) / w;
            const sx = clamp((tx * sxW) | 0, 0, sxW - 1);

            const s = src[sy * sxW + sx];
            const a = s >>> 24;         // alpha byte
            if (a === 0) continue;

            const idx = y * W + x;

            // depth test for occlusion
            if (z >= zbuf[idx]) continue;

            zbuf[idx] = z;
            dst32[idx] = s;
        }
    }
}

export function drawScreenTransition(UIBuffer32, canvasW, canvasH) {
    if (!screenTransition) return;
    
    const p = screenTransition.progress; // 0 to 1
    const centerX = canvasW * 0.5;
    const centerY = canvasH * 0.5;
    const halfW = canvasW * 0.5;
    const halfH = canvasH * 0.5;
    
    // Ease-in for SmOoThInG
    const eased = p * p;
    
    // Fade it blend
    const shapeBlend = p;
    
    const maxReach = Math.max(halfW, halfH) * 1.2;
    const size = maxReach * eased;
    
    const blackColor = 0xFF000000;
    
    for (let y = 0; y < canvasH; y++) {
        for (let x = 0; x < canvasW; x++) {
            const dx = Math.abs(x - centerX);
            const dy = Math.abs(y - centerY);
            
            // Interpolate between diamond and square shape for fade in
            const diamondDist = (dx + dy) / (Math.sqrt(2) * size);
            const squareDist = Math.max(dx, dy) / size;
            const dist = diamondDist * (1 - shapeBlend) + squareDist * shapeBlend;
            
            // Draw black where dist > 1 (outside the shape)
            if (dist > 1) {
                const idx = y * canvasW + x;
                UIBuffer32[idx] = blackColor;
            }
        }
    }
}