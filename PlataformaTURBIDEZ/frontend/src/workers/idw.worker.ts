// IDW Web Worker - Offloads heavy pixel computation from main thread
// Includes spatial grid index for O(1) neighbor lookups instead of O(N)

// Color interpolation (same as main thread)
function getTurbidityColor(v: number): [number, number, number] {
  const stops = [
    { val: 0, r: 10, g: 30, b: 120 },
    { val: 4, r: 0, g: 80, b: 220 },
    { val: 8, r: 0, g: 180, b: 230 },
    { val: 15, r: 20, g: 220, b: 20 },
    { val: 21, r: 255, g: 230, b: 0 },
    { val: 25, r: 255, g: 120, b: 0 },
    { val: 28, r: 220, g: 10, b: 0 },
    { val: 30, r: 140, g: 0, b: 0 },
  ];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i].val && v <= stops[i + 1].val) {
      a = stops[i]; b = stops[i + 1]; break;
    }
  }
  if (v <= stops[0].val) return [stops[0].r, stops[0].g, stops[0].b];
  if (v >= stops[stops.length - 1].val) return [b.r, b.g, b.b];
  const range = b.val - a.val;
  const factor = range === 0 ? 0 : (v - a.val) / range;
  return [
    Math.round(a.r + factor * (b.r - a.r)),
    Math.round(a.g + factor * (b.g - a.g)),
    Math.round(a.b + factor * (b.b - a.b)),
  ];
}

// Spatial Grid Index - Bins points into cells for fast neighbor lookup
interface GridCell {
  indices: number[];
}

function buildSpatialGrid(
  ptsX: Float32Array, ptsY: Float32Array, 
  minX: number, minY: number, cellSize: number, gridW: number, gridH: number
): GridCell[] {
  const grid: GridCell[] = new Array(gridW * gridH);
  for (let i = 0; i < grid.length; i++) grid[i] = { indices: [] };

  for (let i = 0; i < ptsX.length; i++) {
    const cx = Math.floor((ptsX[i] - minX) / cellSize);
    const cy = Math.floor((ptsY[i] - minY) / cellSize);
    if (cx >= 0 && cx < gridW && cy >= 0 && cy < gridH) {
      grid[cy * gridW + cx].indices.push(i);
    }
  }
  return grid;
}

// IDW with spatial grid - only checks neighboring cells
function predictVisual(
  x: number, y: number,
  ptsX: Float32Array, ptsY: Float32Array, ptsV: Float32Array,
  grid: GridCell[], gridMinX: number, gridMinY: number,
  cellSize: number, gridW: number, gridH: number
): { val: number | null; dist: number } {
  const cx = Math.floor((x - gridMinX) / cellSize);
  const cy = Math.floor((y - gridMinY) / cellSize);

  let sumWeight = 0;
  let sumValue = 0;
  let minDistSq = Infinity;

  // Check 5x5 neighborhood for wider coverage
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;

      const cell = grid[ny * gridW + nx];
      for (const i of cell.indices) {
        const ddx = x - ptsX[i];
        const ddy = y - ptsY[i];
        const distSq = ddx * ddx + ddy * ddy;
        if (distSq < minDistSq) minDistSq = distSq;

        if (distSq < 1000000) { // 1000m radius
          const dist = Math.sqrt(distSq);
          const weight = 1.0 / Math.pow(dist + 200, 4);
          sumWeight += weight;
          sumValue += ptsV[i] * weight;
        }
      }
    }
  }

  if (sumWeight === 0) return { val: null, dist: Math.sqrt(minDistSq) };
  return { val: sumValue / sumWeight, dist: Math.sqrt(minDistSq) };
}

// Main worker message handler
self.onmessage = function (e: MessageEvent) {
  const { ptsX, ptsY, ptsV, minX, maxX, minY, maxY, width, height, requestId } = e.data;

  const pX = new Float32Array(ptsX);
  const pY = new Float32Array(ptsY);
  const pV = new Float32Array(ptsV);

  // Build spatial grid (400m cells)
  const cellSize = 400;
  const gridW = Math.ceil((maxX - minX) / cellSize) + 1;
  const gridH = Math.ceil((maxY - minY) / cellSize) + 1;
  const grid = buildSpatialGrid(pX, pY, minX, minY, cellSize, gridW, gridH);

  // Compute IDW for each pixel
  const pixelData = new Uint8ClampedArray(width * height * 4);

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const worldX = minX + (px / width) * (maxX - minX);
      const worldY = maxY - (py / height) * (maxY - minY);
      const { val, dist } = predictVisual(
        worldX, worldY, pX, pY, pV,
        grid, minX, minY, cellSize, gridW, gridH
      );

      const idx = (py * width + px) * 4;
      if (val !== null && dist < 800) {
        const [r, g, b] = getTurbidityColor(val);
        pixelData[idx] = r;
        pixelData[idx + 1] = g;
        pixelData[idx + 2] = b;
        pixelData[idx + 3] = 255;
      } else {
        pixelData[idx + 3] = 0;
      }
    }
  }

  // Transfer the buffer back (zero-copy)
  (self as any).postMessage({ pixelData: pixelData.buffer, width, height, requestId, bounds: e.data.bounds }, [pixelData.buffer]);
};
