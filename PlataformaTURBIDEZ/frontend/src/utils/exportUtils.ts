import * as api from '../services/api';

export async function generateInfographicBlob(
    mapCanvas: HTMLCanvasElement,
    targetDate: string
): Promise<Blob> {
    try {
        let stats = null;
        try {
            stats = await api.fetchRangeStats(targetDate, targetDate);
        } catch (e) {
            console.error("Failed to fetch stats for PNG:", e);
        }

        const meanText = stats && !stats.empty ? `${stats.mean.toFixed(2)} NTU` : 'N/A';
        const maxText = stats && !stats.empty ? `${stats.max.toFixed(2)} NTU` : 'N/A';
        const p90Text = stats && !stats.empty ? `${stats.p90.toFixed(2)} NTU` : 'N/A';
        const minText = stats && !stats.empty && stats.min !== undefined ? `${stats.min.toFixed(2)} NTU` : 'N/A';
        const cvText = stats && !stats.empty && stats.cv !== undefined ? `${stats.cv.toFixed(2)} %` : 'N/A';

        // Create the final 1200x1200 Infographic Canvas
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = 1200;
        finalCanvas.height = 1200;
        const ctx = finalCanvas.getContext('2d');
        if (!ctx) throw new Error("Could not initialize 2D context");

        // Background
        ctx.fillStyle = '#0f172a'; // slate-900
        ctx.fillRect(0, 0, 1200, 1200);

        // Header Graphic Line
        ctx.fillStyle = 'rgba(56, 189, 248, 0.3)'; // sky-400
        ctx.fillRect(40, 110, 1120, 2);

        // Texts - Title
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Reporte de Calidad de Agua - TurbidezApp', 40, 60);

        // Texts - Subtitle
        ctx.fillStyle = '#94a3b8';
        ctx.font = '18px monospace';
        ctx.fillText('Análisis Espacio-Temporal Generado Automáticamente', 40, 90);

        // Date Badge
        const dateStr = targetDate ? new Date(targetDate + 'T12:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase() : 'VISIÓN GLOBAL';
        ctx.font = 'bold 20px monospace';
        const textWidth = ctx.measureText(dateStr).width;
        const bWidth = textWidth + 40;
        const bX = 1160 - bWidth;
        
        ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
        ctx.beginPath();
        ctx.roundRect(bX, 40, bWidth, 44, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.fillText(dateStr, bX + (bWidth/2), 69);

        ctx.save();
        ctx.beginPath();
        // El contenedor destino en el PDF: x:40, y:140, ancho:1120, alto:680
        ctx.roundRect(40, 140, 1120, 680, 16);
        ctx.clip();
        
        // ALGORITMO OBJECT-FIT: COVER (Centrado Perfecto Garantizado)
        const destW = 1120;
        const destH = 680;
        const sourceW = mapCanvas.width;
        const sourceH = mapCanvas.height;
        
        const targetRatio = destW / destH;
        const sourceRatio = sourceW / sourceH;
        
        let sw = sourceW;
        let sh = sourceH;
        let sx = 0;
        let sy = 0;

        // Comparamos proporciones para recortar lo que sobre, sin deformar
        if (sourceRatio > targetRatio) {
            // La pantalla original es más ancha que el recuadro del PDF.
            // Recortamos los lados y centramos.
            sw = sourceH * targetRatio;
            sx = (sourceW - sw) / 2;
        } else {
            // La pantalla original es más alta que el recuadro del PDF.
            // Recortamos arriba y abajo, y centramos.
            sh = sourceW / targetRatio;
            // Multiplicar por 0.9 o 1 alinea el recorte hacia el fondo (Sur)
            sy = (sourceH - sh) * 0.9;
        }
        
        // Dibuja la imagen recortada perfectamente dentro del recuadro
        ctx.drawImage(mapCanvas, sx, sy, sw, sh, 40, 140, destW, destH);
        
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
        // Draw KPI Boxes (Moved down slightly to accommodate taller map)
        const drawKpiBox = (x: number, y: number, colorText: string, colorBg: string, colorBorder: string, title: string, value: string) => {
           ctx.fillStyle = colorBg;
           ctx.beginPath();
           ctx.roundRect(x, y, 350, 120, 16);
           ctx.fill();
           ctx.strokeStyle = colorBorder;
           ctx.lineWidth = 2;
           ctx.stroke();

           ctx.fillStyle = colorText;
           ctx.font = 'bold 16px monospace';
           ctx.textAlign = 'center';
           ctx.fillText(title, x + 175, y + 40);

           ctx.fillStyle = '#ffffff';
           ctx.font = 'bold 46px monospace';
           ctx.fillText(value, x + 175, y + 90);
        };

        // Row 1 (Shifted from 750 to 860)
        drawKpiBox(40, 860, '#38bdf8', 'rgba(56, 189, 248, 0.05)', 'rgba(56, 189, 248, 0.3)', 'MEDIA NTU', meanText);
        drawKpiBox(425, 860, '#10b981', 'rgba(16, 185, 129, 0.05)', 'rgba(16, 185, 129, 0.3)', 'MÁXIMO NTU', maxText);
        drawKpiBox(810, 860, '#a855f7', 'rgba(168, 85, 247, 0.05)', 'rgba(168, 85, 247, 0.3)', 'MÍNIMO NTU', minText);

        // Row 2 (Shifted from 895 to 1005)
        drawKpiBox(40, 1005, '#f97316', 'rgba(249, 115, 22, 0.05)', 'rgba(249, 115, 22, 0.3)', 'PERCENTIL 90', p90Text);
        
        // --- Draw Legend Box Iteration ---
        const lx = 425;
        const ly = 1005;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.beginPath();
        ctx.roundRect(lx, ly, 350, 120, 16);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('TURBIDEZ (NTU)', lx + 175, ly + 30);
        
        // Match the frontend CSS gradient exactly
        const gradient = ctx.createLinearGradient(lx + 30, 0, lx + 320, 0);
        gradient.addColorStop(0, 'rgb(10,30,120)');
        gradient.addColorStop(0.13, 'rgb(0,80,220)');
        gradient.addColorStop(0.26, 'rgb(0,180,230)');
        gradient.addColorStop(0.49, 'rgb(20,220,20)');
        gradient.addColorStop(0.72, 'rgb(255,230,0)');
        gradient.addColorStop(0.85, 'rgb(255,120,0)');
        gradient.addColorStop(1, 'rgb(140,0,0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(lx + 30, ly + 45, 290, 18, 9);
        ctx.fill();
        
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 12px monospace';
        
        // Exact labels and positions matching UI (0, 8, 15, 25, 30+)
        // X positions matching percentage: 0%, 13% (~8?), 26% (~15?), 49%, 72%, 100%
        // Actually the UI spaces them out evenly. 5 labels -> 0, 25%, 50%, 75%, 100%
        const positions = [
            { text: '0', x: lx + 35 },
            { text: '8', x: lx + 30 + (290 * 0.25) },
            { text: '15', x: lx + 30 + (290 * 0.50) },
            { text: '25', x: lx + 30 + (290 * 0.75) },
            { text: '30+', x: lx + 315 },
        ];
        
        positions.forEach(pos => {
            ctx.textAlign = 'center';
            ctx.fillText(pos.text, pos.x, ly + 80);
        });

        // Exact class names
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('DESPEJADO', lx + 35, ly + 95);
        ctx.fillText('BAJO', lx + 30 + (290 * 0.25), ly + 95);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
        ctx.fillText('MEDIO', lx + 30 + (290 * 0.50), ly + 95);
        ctx.fillStyle = 'rgba(234, 179, 8, 0.8)';
        ctx.fillText('ALTO', lx + 30 + (290 * 0.75), ly + 95);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.fillText('CRÍTICO', lx + 315, ly + 95);
        // --- End Legend ---

        drawKpiBox(810, 1005, '#ec4899', 'rgba(236, 72, 153, 0.05)', 'rgba(236, 72, 153, 0.3)', 'VARIACIÓN (CV)', cvText);

        // Footer
        ctx.fillStyle = '#64748b';
        ctx.font = '14px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('Documento validado analíticamente · TurbidezApp', 1160, 1170);

        return new Promise((resolve, reject) => {
            finalCanvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Failed to export blob"));
            }, 'image/png');
        });
    } catch (err) {
        console.error("Error generating infographic block: ", err);
        throw err;
    }
}
