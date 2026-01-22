import { packRGBA, clamp                                        } from "./supportMathFuncs.js";
import { canvasHeight, canvasWidth, UIBuffer32, MAINMENUOPENED  } from "./main.js";
import { ship                                                   } from "./playerShip.js";

///////////////////////////// UI Draw functions ///////////////////////////

function uiPutPixel(x, y, col) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) return;
    UIBuffer32[y * canvasWidth + x] = col;
}

function uiRect(x, y, w, h, col) {
    const x0 = Math.max(0, x|0), y0 = Math.max(0, y|0);
    const x1 = Math.min(canvasWidth, (x + w)|0);
    const y1 = Math.min(canvasHeight, (y + h)|0);
    for (let yy = y0; yy < y1; yy++) {
        let idx = yy * canvasWidth + x0;
        for (let xx = x0; xx < x1; xx++) UIBuffer32[idx++] = col;
    }
}

function uiRectOutline(x, y, w, h, col) {
    uiRect(x, y, w, 1, col);
    uiRect(x, y + h - 1, w, 1, col);
    uiRect(x, y, 1, h, col);
    uiRect(x + w - 1, y, 1, h, col);
}

function uiLine(x0, y0, x1, y1, col) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
        uiPutPixel(x0, y0, col);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}



//---------- Bitmap font (4x6) ----------
// Each glyph is 6 rows, 4 bits per row (MSB on the left).
// Example row 0b1111 means ####
const FONT_W = 4;
const FONT_H = 6;

const FONT4x6 = {
    "0": [0b1111,0b1001,0b1001,0b1001,0b1001,0b1111],
    "1": [0b0010,0b0110,0b0010,0b0010,0b0010,0b0111],
    "2": [0b1111,0b0001,0b1111,0b1000,0b1000,0b1111],
    "3": [0b1111,0b0001,0b1111,0b0001,0b0001,0b1111],
    "4": [0b1001,0b1001,0b1111,0b0001,0b0001,0b0001],
    "5": [0b1111,0b1000,0b1111,0b0001,0b0001,0b1111],
    "6": [0b1111,0b1000,0b1111,0b1001,0b1001,0b1111],
    "7": [0b1111,0b0001,0b0010,0b0100,0b1000,0b1000],
    "8": [0b1111,0b1001,0b1111,0b1001,0b1001,0b1111],
    "9": [0b1111,0b1001,0b1001,0b1111,0b0001,0b1111],

    "A": [0b0110,0b1001,0b1001,0b1111,0b1001,0b1001],
    "B": [0b1110,0b1001,0b1110,0b1001,0b1001,0b1110],
    "C": [0b0111,0b1000,0b1000,0b1000,0b1000,0b0111],
    "D": [0b1110,0b1001,0b1001,0b1001,0b1001,0b1110],
    "E": [0b1111,0b1000,0b1110,0b1000,0b1000,0b1111],
    "F": [0b1111,0b1000,0b1110,0b1000,0b1000,0b1000],
    "G": [0b0111,0b1000,0b1000,0b1011,0b1001,0b0111],
    "H": [0b1001,0b1001,0b1111,0b1001,0b1001,0b1001],
    "I": [0b1110,0b0100,0b0100,0b0100,0b0100,0b1110],
    "L": [0b0100,0b0100,0b0100,0b0100,0b0100,0b0111],
    "M": [0b1001,0b1111,0b1111,0b1001,0b1001,0b1001],
    "N": [0b1001,0b1101,0b1101,0b1011,0b1001,0b1001],
    "P": [0b1110,0b1001,0b1110,0b1000,0b1000,0b1000],
    "R": [0b1110,0b1001,0b1110,0b1010,0b1001,0b1001],
    "T": [0b1111,0b0100,0b0100,0b0100,0b0100,0b0100],
    "S": [0b0111,0b1000,0b1111,0b0001,0b0001,0b1110],
    "U": [0b1001,0b1001,0b1001,0b1001,0b1001,0b0110],
    "V": [0b1001,0b1001,0b1001,0b1001,0b0110,0b0100],
    "Y": [0b1001,0b1001,0b0110,0b0010,0b0010,0b0010],

    ":": [0b0000,0b0010,0b0000,0b0010,0b0000,0b0000],
    ".": [0b0000,0b0000,0b0000,0b0000,0b0010,0b0000],
    "-": [0b0000,0b0000,0b1111,0b0000,0b0000,0b0000],
    " ": [0b0000,0b0000,0b0000,0b0000,0b0000,0b0000],
};

// Draw one glyph at (x,y). "scale" makes chunky retro text.
function uiChar(x, y, ch, col, scale = 2) {
    const g = FONT4x6[ch] || FONT4x6["?"];
    if (!g) return;
        for (let row = 0; row < FONT_H; row++) {
        const bits = g[row] | 0;
        for (let cx = 0; cx < FONT_W; cx++) {
            const on = (bits & (1 << (FONT_W - 1 - cx))) !== 0;
            if (!on) continue;

            const px = x + cx * scale;
            const py = y + row * scale;
            for (let sy = 0; sy < scale; sy++) {
                for (let sx = 0; sx < scale; sx++) {
                    uiPutPixel(px + sx, py + sy, col);
                }
            }
        }
    }
}

function uiText(x, y, text, col, scale = 2, spacing = 1) {
    let penX = x;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i].toUpperCase();
        uiChar(penX, y, ch, col, scale);
        penX += (FONT_W * scale) + spacing;
    }
}



function drawUI() {
    const white = packRGBA(245, 245, 245, 255);
    // Check if main menu is not opened or opened
    if (!MAINMENUOPENED) {
        // Shield (HP) bar
            const ShieldbarX = 20, ShieldbarY = 330, ShieldbarW = 80, ShieldbarH = 12;
            uiRectOutline(ShieldbarX - 2, ShieldbarY - 2, ShieldbarW + 4, ShieldbarH + 4, packRGBA(200, 200, 200, 255));
            uiRect(ShieldbarX, ShieldbarY, ShieldbarW, ShieldbarH, packRGBA(100, 100, 100, 255));
            uiRect(ShieldbarX, ShieldbarY, ((ShieldbarW * clamp(ship.Shield, 0, 100)) / 5) | 0, ShieldbarH, packRGBA(60, 155, 255, 255));
        // Energy bar 
            const barX = 540, barY = 330, barW = 80, barH = 12;
            uiRectOutline(barX - 2, barY - 2, barW + 4, barH + 4, packRGBA(200, 200, 200, 255));
            uiRect(barX, barY, barW, barH, packRGBA(100, 100, 100, 255));
            uiRect(barX, barY, ((barW * clamp(ship.Energy, 0, 100)) / 5) | 0, barH, packRGBA(120, 100, 210, 255));

        // Shield text
            uiText(40, 315, "SHIELD", white, 1.5);
        // Energy text
            uiText(560, 315, "ENERGY", white, 1.5);
        // Score text
            uiText(260, 20, `SC0RE: ${Math.floor(ship.Score)}`, white, 3);
    }
    else
    {
        // Draw Main Menu UI
        uiText(200, 100, "STARSHIP", white, 3);
        uiText(200, 150, "GAME", white, 3);
        uiText(200, 250, "Press SPACE to start", white, 1.5);
    }
}

export { drawUI };