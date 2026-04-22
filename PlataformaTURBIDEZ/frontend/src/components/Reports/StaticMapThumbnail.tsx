import React, { useEffect, useRef } from 'react';
import 'ol/ol.css';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import ImageLayer from 'ol/layer/Image';
import Static from 'ol/source/ImageStatic';
import { fromLonLat } from 'ol/proj';
import { defaults as defaultInteractions } from 'ol/interaction';

const CARTAGENA_CENTER = fromLonLat([-75.52, 10.36]);

interface StaticMapThumbnailProps {
  date: string;
  satellite?: 'S2' | 'S3';
  algorithm?: string;
}

const StaticMapThumbnail: React.FC<StaticMapThumbnailProps> = ({ date, satellite = 'S3', algorithm = 'SVR' }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  
  const darkLayerRef = useRef<TileLayer<XYZ>>(
    new TileLayer({
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Tiles &copy; Esri',
        crossOrigin: 'anonymous',
      }),
      zIndex: 1,
    })
  );

  const imageLayerRef = useRef<ImageLayer<Static>>(
    new ImageLayer({
      source: new Static({
        url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        imageExtent: CARTAGENA_CENTER.concat(CARTAGENA_CENTER)
      }),
      opacity: 0.9,
      zIndex: 6,
    })
  );

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current) return;

    const map = new Map({
        target: mapRef.current,
        controls: [], // NO CONTROLS
        interactions: defaultInteractions({ doubleClickZoom: false, dragPan: false, mouseWheelZoom: false, pinchZoom: false, altShiftDragRotate: false, pinchRotate: false }), // NO INTERACTIONS
        layers: [darkLayerRef.current, imageLayerRef.current],
        view: new View({
            center: CARTAGENA_CENTER,
            zoom: 10.2,
            minZoom: 9,
            maxZoom: 18,
            enableRotation: false,
        }),
    });

    mapInstance.current = map;

    return () => {
        if (mapInstance.current) {
            mapInstance.current.setTarget(undefined);
            mapInstance.current.dispose();
            mapInstance.current = null;
        }
    };
  }, []);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<number>(0);
  
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../../workers/idw.worker.ts', import.meta.url),
      { type: 'module' }
    );
    return () => { workerRef.current?.terminate(); };
  }, []);

  useEffect(() => {
    if (!date) return;

    let isCancelled = false;
    const controller = new AbortController();

    const fetchHeatmapData = async () => {
      try {
        const response = await fetch(
          `/api/v1/turbidity/heatmap-fast?start_date=${date}&end_date=${date}&satellite=${satellite}&algorithm=${algorithm}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error('Failed to fetch heatmap data');
        const result = await response.json();
        
        if (isCancelled) return;

        if (!result.lons || result.lons.length === 0) {
            imageLayerRef.current.setSource(null);
            return;
        }

        const len = result.lons.length;
        const ptsX = new Float32Array(len);
        const ptsY = new Float32Array(len);
        const ptsV = new Float32Array(len);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        for (let i = 0; i < len; i++) {
           const coords = fromLonLat([result.lons[i], result.lats[i]]);
           ptsX[i] = coords[0];
           ptsY[i] = coords[1];
           ptsV[i] = result.vals[i];
           if (coords[0] < minX) minX = coords[0];
           if (coords[0] > maxX) maxX = coords[0];
           if (coords[1] < minY) minY = coords[1];
           if (coords[1] > maxY) maxY = coords[1];
        }
        
        const padding = 1000;
        minX -= padding; maxX += padding; minY -= padding; maxY += padding;
        const width = 250; 
        const height = Math.round(width * ((maxY - minY) / (maxX - minX)));

        const currentId = ++requestIdRef.current;
        if (!workerRef.current || isCancelled) return;

        workerRef.current.onmessage = (e: MessageEvent) => {
          if (isCancelled || e.data.requestId !== requestIdRef.current) return;

          const { pixelData, width: w, height: h, bounds } = e.data;
          const imgData = new ImageData(new Uint8ClampedArray(pixelData), w, h);
          
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = w; tmpCanvas.height = h;
          tmpCanvas.getContext('2d')!.putImageData(imgData, 0, 0);
          ctx.filter = 'blur(6px)';
          ctx.drawImage(tmpCanvas, 0, 0);

          const newSource = new Static({ 
            url: canvas.toDataURL(), 
            imageExtent: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY] 
          });
          
          imageLayerRef.current.setSource(newSource);
        };
        
        workerRef.current.postMessage({
          ptsX: ptsX.buffer,
          ptsY: ptsY.buffer,
          ptsV: ptsV.buffer,
          minX, maxX, minY, maxY, width, height,
          requestId: currentId,
          bounds: { minX, minY, maxX, maxY }
        });

      } catch (error: any) { 
        if (error.name === 'AbortError') return;
        console.error("Error fetching heatmap thumbnail data:", error);
      }
    };

    fetchHeatmapData();
    return () => {
        isCancelled = true;
        controller.abort();
    };
  }, [date, satellite, algorithm]);

  return (
    <div className="w-full h-full relative group">
      <div ref={mapRef} className="w-full h-full" />
      {/* Decorative disabled overlay */}
      <div className="absolute inset-0 bg-slate-900/10 pointer-events-none transition-colors group-hover:bg-slate-950/20" />
    </div>
  );
};

export default React.memo(StaticMapThumbnail);
