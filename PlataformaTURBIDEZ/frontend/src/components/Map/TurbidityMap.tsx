import { useEffect, useRef, useState } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import ImageLayer from 'ol/layer/Image';
import VectorLayer from 'ol/layer/Vector';
import Static from 'ol/source/ImageStatic';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from 'ol/style';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Geometry from 'ol/geom/Geometry';
import GeoJSON from 'ol/format/GeoJSON';
import { getVectorContext } from 'ol/render';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls } from 'ol/control';
import { defaults as defaultInteractions } from 'ol/interaction';
import 'ol/ol.css';

// Initial View centered around Cartagena Bay
const CARTAGENA_CENTER = fromLonLat([-75.5462, 10.3400]);

const BAY_ZONES = [
  // MACROZONA
  { nameKey: 'zCartagena', lon: -75.5450, lat: 10.3400, minZoom: 10, maxZoom: 12.2, fontSize: '20px', isWater: true },

  // ZONAS PRINCIPALES (Agua e Islas)
  { nameKey: 'zInterna', lon: -75.539778, lat: 10.401196, minZoom: 10, maxZoom: 12.2, fontSize: '15px', isWater: true },
  { nameKey: 'zExterna', lon: -75.539778, lat: 10.327235, minZoom: 10, maxZoom: 12.2, fontSize: '15px', isWater: true },
  { nameKey: 'zTierraBomba', lon: -75.5680, lat: 10.3500, minZoom: 12.2, maxZoom: 16, fontSize: '14px', isWater: false },
  { nameKey: 'zBaru', lon: -75.5700, lat: 10.2300, minZoom: 11.5, maxZoom: 15, fontSize: '15px', isWater: false },

  // LUGARES CRÍTICOS Y COSTA
  { nameKey: 'zMamonal', lon: -75.494932, lat: 10.323446, minZoom: 12.5, maxZoom: 16, fontSize: '13px', isWater: false },
  { nameKey: 'zDique', lon: -75.527197, lat: 10.298368, minZoom: 12.5, maxZoom: 16, fontSize: '13px', isWater: true },
  { nameKey: 'zBocachica', lon: -75.580709, lat: 10.316157, minZoom: 12.5, maxZoom: 16, fontSize: '13px', isWater: true },
  { nameKey: 'zBocagrande', lon: -75.5650, lat: 10.3950, minZoom: 14, maxZoom: 18, fontSize: '12px', isWater: true },
  
  // MICRO-ZONAS Y BARRIOS (Zoom Profundo)
  { nameKey: 'zPasacaballos', lon: -75.517270, lat: 10.284773, minZoom: 14, maxZoom: 18, fontSize: '12px', isWater: false },
  { nameKey: 'zCastillogrande', lon: -75.5500, lat: 10.3960, minZoom: 14.5, maxZoom: 18, fontSize: '12px', isWater: false },
  { nameKey: 'zManga', lon: -75.5340, lat: 10.4100, minZoom: 14.5, maxZoom: 18, fontSize: '12px', isWater: false },
  { nameKey: 'zCienaga', lon: -75.539661, lat: 10.279632, minZoom: 14.5, maxZoom: 18, fontSize: '12px', isWater: true }
];

import ScientificTooltip from './ScientificTooltip';


interface TurbidityMapProps {
  lang?: 'es' | 'en';
  baseLayerType?: 'satellite' | 'dark' | 'light' | 'relief';
  startDate?: string;
  endDate?: string;
  globalStartDate?: string;
  globalEndDate?: string;
  satellite?: 'S2' | 'S3';
  algorithm?: string;
  onRenderComplete?: () => void;
  onMapInteraction?: () => void;
  onExpandRange?: () => void;
}

const mapT = {
  es: {
    turbidityPoint: 'Punto de Turbidez',
    estimatedNtu: 'NTU Estimado',
    lat: 'Latitud',
    lon: 'Longitud',
    legendTitle: 'Turbidez (NTU)',
    maxPoint: 'Punto Máximo',
    minPoint: 'Punto Mínimo',
    hideZones: 'Ocultar Zonas',
    showZones: 'Mostrar Zonas',
    zCartagena: 'BAHÍA DE CARTAGENA',
    zInterna: 'BAHÍA INTERNA',
    zExterna: 'BAHÍA EXTERNA',
    zTierraBomba: 'ISLA DE TIERRA BOMBA',
    zBaru: 'PENÍNSULA DE BARÚ',
    zMamonal: 'ZONA INDUSTRIAL MAMONAL',
    zDique: 'DESEMBOCADURA CANAL DEL DIQUE',
    zBocachica: 'CANAL DE BOCACHICA',
    zBocagrande: 'ESCOLLERA DE BOCAGRANDE',
    zPasacaballos: 'PASACABALLOS',
    zCastillogrande: 'CASTILLOGRANDE',
    zManga: 'MANGA',
    zCienaga: 'CIÉNAGA HONDA'
  },
  en: {
    turbidityPoint: 'Turbidity Point',
    estimatedNtu: 'Estimated NTU',
    lat: 'Latitude',
    lon: 'Longitude',
    legendTitle: 'Turbidity (NTU)',
    maxPoint: 'Maximum Point',
    minPoint: 'Minimum Point',
    hideZones: 'Hide Zones',
    showZones: 'Show Zones',
    zCartagena: 'CARTAGENA BAY',
    zInterna: 'INNER BAY',
    zExterna: 'OUTER BAY',
    zTierraBomba: 'TIERRA BOMBA ISLAND',
    zBaru: 'BARU PENINSULA',
    zMamonal: 'MAMONAL INDUSTRIAL ZONE',
    zDique: 'DIQUE CANAL MOUTH',
    zBocachica: 'BOCACHICA CHANNEL',
    zBocagrande: 'BOCAGRANDE BREAKWATER',
    zPasacaballos: 'PASACABALLOS',
    zCastillogrande: 'CASTILLOGRANDE',
    zManga: 'MANGA',
    zCienaga: 'HONDA SWAMP'
  }
};

// Note: getTurbidityColor and predictTurbidityVisual have been moved to the IDW Web Worker
// (src/workers/idw.worker.ts) for off-thread computation.

// Logical IDW Predictor - kept on main thread for tooltip clicks (runs once per click, negligible cost)
const predictTurbidityLogical = (x: number, y: number, ptsX: Float32Array, ptsY: Float32Array, ptsV: Float32Array) => {
    let sumWeight = 0;
    let sumValue = 0;
    let minDistSq = Infinity;
    let nearestVal = null;
    const len = ptsX.length;
    
    for (let i = 0; i < len; i++) {
        const dx = x - ptsX[i];
        if (dx > 800 || dx < -800) continue;
        const dy = y - ptsY[i];
        if (dy > 800 || dy < -800) continue;
        const distSq = dx*dx + dy*dy;
        if (distSq < minDistSq) { minDistSq = distSq; nearestVal = ptsV[i]; }
        if (distSq < 1) return { val: ptsV[i], dist: 0 };
        if (distSq < 640000) { 
            const weight = 1.0 / distSq;
            sumWeight += weight;
            sumValue += ptsV[i] * weight;
        }
    }
    const dist = Math.sqrt(minDistSq);
    if (dist <= 200 && nearestVal !== null) return { val: nearestVal, dist };
    if (sumWeight === 0) return { val: null, dist };
    return { val: sumValue / sumWeight, dist };
};


const TurbidityMap = ({ 
  lang = 'es', 
  baseLayerType = 'dark', 
  startDate, 
  endDate, 
  globalStartDate,
  globalEndDate,
  satellite = 'S3',
  algorithm = 'SVR',
  onRenderComplete, 
  onMapInteraction,
  onExpandRange
}: TurbidityMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const t = mapT[lang] || mapT.es;
  const tRef = useRef(t);



  // Label Visibility Toggle
  const [showLabels, setShowLabels] = useState(true);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, lon: number, lat: number} | null>(null);

  const onRenderCompleteRef = useRef(onRenderComplete);
  useEffect(() => {
    onRenderCompleteRef.current = onRenderComplete;
  }, [onRenderComplete]);

  const startDateRef = useRef(startDate);
  useEffect(() => { startDateRef.current = startDate; }, [startDate]);
  useEffect(() => {
    onRenderCompleteRef.current = onRenderComplete;
  }, [onRenderComplete]);

  const onMapInteractionRef = useRef(onMapInteraction);
  useEffect(() => {
    onMapInteractionRef.current = onMapInteraction;
  }, [onMapInteraction]);

  // Sync translation ref robustly so OpenLayers style closures re-render instantly when changed
  useEffect(() => {
    tRef.current = t;
    if (labelLayerRef.current) labelLayerRef.current.changed();
  }, [t]);

  // Handle Visibility of Labels Layer
  useEffect(() => {
    if (labelLayerRef.current) {
        labelLayerRef.current.setVisible(showLabels);
    }
  }, [showLabels]);
  
  // Custom Dynamic IDW Image Layer (Front - new frame)
  const imageLayerRef = useRef<ImageLayer<Static>>(
    new ImageLayer({
      source: new Static({
        url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        imageExtent: CARTAGENA_CENTER.concat(CARTAGENA_CENTER)
      }),
      opacity: 1.0,
      zIndex: 6,
    })
  );

  const ptsXRef = useRef<Float32Array>(new Float32Array(0));
  const ptsYRef = useRef<Float32Array>(new Float32Array(0));
  const ptsVRef = useRef<Float32Array>(new Float32Array(0));
  const [clickInfo, setClickInfo] = useState<{ ntu: number; lat: number; lon: number; x: number; y: number; date: string } | null>(null);

  // GeoJSON Clipping Mask logic
  const clipGeometryRef = useRef<Geometry | null>(null);

  useEffect(() => {
    fetch('/bahia_cartagena.json')
      .then((res) => res.json())
      .then((data) => {
        const features = new GeoJSON().readFeatures(data, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857'
        });
        if (features && features.length > 0) {
          const geom = features[0].getGeometry();
          if (geom) clipGeometryRef.current = geom;
        }
      })
      .catch((err) => console.error("Error loading GeoJSON mask:", err));
  }, []);

  useEffect(() => {
    const layer = imageLayerRef.current;
    
    const preRenderListener = (event: any) => {
      const ctx = event.context as CanvasRenderingContext2D;
      const geom = clipGeometryRef.current;
      if (geom) {
        ctx.save();
        const vectorContext = getVectorContext(event);
        vectorContext.setStyle(new Style({ fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }) }));
        vectorContext.drawGeometry(geom);
        ctx.clip(); // <--- Apply the mask
      }
    };

    const postRenderListener = (event: any) => {
      const ctx = event.context as CanvasRenderingContext2D;
      if (clipGeometryRef.current) {
        ctx.restore(); // <--- Clean up the context
      }
    };

    layer.on('prerender', preRenderListener);
    layer.on('postrender', postRenderListener);

    return () => {
      layer.un('prerender', preRenderListener);
      layer.un('postrender', postRenderListener);
    };
  }, []);

  // Vector Layer for potential future overlays
  const vectorLayerRef = useRef<VectorLayer<VectorSource>>(
    new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        stroke: new Stroke({ color: '#10b981', width: 3 }),
        fill: new Fill({ color: 'rgba(16, 185, 129, 0.1)' }),
      }),
      zIndex: 10,
    })
  );

  // Dynamic Label Layer
  const labelLayerRef = useRef<VectorLayer<VectorSource>>(
    new VectorLayer({
      source: new VectorSource(),
      zIndex: 15, // Above heatmap, below pins
      declutter: true, // Prevents text overlapping
    })
  );

  // Update visual marker when user clicks
  useEffect(() => {
    const source = vectorLayerRef.current.getSource();
    if (!source) return;
    source.clear();
    
    if (clickInfo) {
      const feature = new Feature({
        geometry: new Point(fromLonLat([clickInfo.lon, clickInfo.lat]))
      });
      // Cyan marker with white border
      feature.setStyle(new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: '#22d3ee' }),
          stroke: new Stroke({ color: '#ffffff', width: 2.5 })
        })
      }));
      source.addFeature(feature);
    }
  }, [clickInfo]);

  // Use refs for tile layers to toggle them easily
  const darkLayerRef = useRef<TileLayer<XYZ>>(
    new TileLayer({
      source: new XYZ({
        url: 'https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attributions: '&copy; CARTO',
        crossOrigin: 'anonymous',
        cacheSize: 500
      }),
      visible: true
    })
  );

  const satelliteLayerRef = useRef<TileLayer<XYZ>>(
    new TileLayer({
      source: new XYZ({
       url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', 
        attributions: '&copy; Google',
        crossOrigin: 'anonymous',
        maxZoom: 20, cacheSize: 500
      }),
      visible: false
    })
  );

  const lightLayerRef = useRef<TileLayer<XYZ>>(
    new TileLayer({
      source: new XYZ({
        url: 'https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attributions: '&copy; CARTO',
        crossOrigin: 'anonymous',
        cacheSize: 500
      }),
      visible: false
    })
  );

  const reliefLayerRef = useRef<TileLayer<XYZ>>(
    new TileLayer({
      source: new XYZ({
        url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attributions: 'Map data contributors',
        crossOrigin: 'anonymous',
        cacheSize: 500
      }),
      visible: false
    })
  );

  useEffect(() => {
    darkLayerRef.current.setVisible(baseLayerType === 'dark');
    satelliteLayerRef.current.setVisible(baseLayerType === 'satellite');
    lightLayerRef.current.setVisible(baseLayerType === 'light');
    reliefLayerRef.current.setVisible(baseLayerType === 'relief');
  }, [baseLayerType]);

  // Pin Layer for Extremes
  const pinLayerRef = useRef<VectorLayer<VectorSource>>(
    new VectorLayer({
      source: new VectorSource(),
      zIndex: 20,
      style: new Style({
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ color: '#ef4444' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
        }),
      }),
    })
  );

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new Map({
        target: mapRef.current,
        controls: defaultControls({ zoom: true, rotate: false, attribution: false }),
        interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false }),
        layers: [darkLayerRef.current, satelliteLayerRef.current, lightLayerRef.current, reliefLayerRef.current, imageLayerRef.current, vectorLayerRef.current, labelLayerRef.current, pinLayerRef.current],
        view: new View({
            center: CARTAGENA_CENTER,
            zoom: 12.5,
            minZoom: 10,
            maxZoom: 18,
            enableRotation: false,
        }),
    });

    const labelSource = labelLayerRef.current.getSource();
    BAY_ZONES.forEach(zone => {
        const feature = new Feature({
            geometry: new Point(fromLonLat([zone.lon, zone.lat])),
            ...zone
        });
        labelSource?.addFeature(feature);
    });

    labelLayerRef.current.setStyle((feature) => {
        if (!mapInstance.current) return new Style({});
        const currentZoom = mapInstance.current.getView().getZoom() || 12;
        const minZ = feature.get('minZoom');
        const maxZ = feature.get('maxZoom');

        if (currentZoom >= minZ && currentZoom < maxZ) {
            const isWater = feature.get('isWater');
            const translationKey = feature.get('nameKey') as keyof typeof mapT.es;
            const localizedName = tRef.current[translationKey] || feature.get('nameKey');
            
            // Estilo Google: Agua (Blanco/Cyan pálido con halo azul oscuro), Tierra (Gris claro con halo oscuro)
            const textColor = isWater ? '#f8fafc' : '#e2e8f0';
            const haloColor = isWater ? 'rgba(15, 23, 42, 0.45)' : 'rgba(0, 0, 0, 0.5)';
            const fontWeight = currentZoom < 13 ? '700' : '600'; // Más grueso de lejos, más fino de cerca

            return new Style({
                text: new Text({
                    text: localizedName,
                    font: `${fontWeight} ${feature.get('fontSize')} "Roboto", "Segoe UI", "Helvetica Neue", sans-serif`,
                    fill: new Fill({ color: textColor }),
                    // El "Halo" se logra con un stroke semi-transparente pero ancho
                    stroke: new Stroke({ color: haloColor, width: 4.5 }),
                    textAlign: 'center',
                    textBaseline: 'middle',
                    padding: [5, 5, 5, 5]
                })
            });
        }
        return new Style({});
    });

    map.on('moveend', () => {
        labelLayerRef.current.changed();
    });

    map.on('click', (evt) => {
        setContextMenu(null); // Cerrar menú si está abierto
        const coords = evt.coordinate;
        
        // Block clicks strictly to the bay's water perimeter
        if (clipGeometryRef.current && !clipGeometryRef.current.intersectsCoordinate(coords)) {
            setClickInfo(null);
            return; 
        }

        // 1. Verificar si hicimos clic en un Pin
        let clickedPin = false;
        map.forEachFeatureAtPixel(evt.pixel, (feature) => {
           if (feature.get('isPin')) {
               clickedPin = true;
               const ntu = feature.get('ntu');
               const geom = feature.getGeometry() as Point;
               const lonLat = toLonLat(geom.getCoordinates());
               setClickInfo({ ntu: ntu, lon: lonLat[0], lat: lonLat[1], x: evt.pixel[0], y: evt.pixel[1], date: startDate || '' });
               return true; // Stop iteration
           }
        });

        if (clickedPin) return;

        // Auto-clear pin if user clicks somewhere else
        if (pinLayerRef.current) {
            pinLayerRef.current.getSource()?.clear();
        }

        // 2. Comportamiento normal IDW
        if (ptsXRef.current.length === 0) return;
        const { val, dist } = predictTurbidityLogical(coords[0], coords[1], ptsXRef.current, ptsYRef.current, ptsVRef.current);
        if (val !== null && dist < 800) {
            const lonLat = toLonLat(coords);
            setClickInfo({ ntu: val, lon: lonLat[0], lat: lonLat[1], x: evt.pixel[0], y: evt.pixel[1], date: startDate || '' });
        } else {
            setClickInfo(null);
        }
    });

    // Avísale al padre cuando el usuario empiece a mover el mapa o hacer zoom
    map.on('movestart', () => {
        if (onMapInteractionRef.current) {
            onMapInteractionRef.current();
        }
    });

    // En postrender, dibujamos leyenda y fecha directamente en el canvas si estamos grabando video
    imageLayerRef.current.on('postrender', (evt: any) => {
        if ((window as any).__isRecordingMap || (window as any).__isRecordingBgMap) {
            const ctx = evt.context as CanvasRenderingContext2D;
            if (!ctx || !ctx.fillRect) return; // Asegurar que es 2D context
            
            ctx.save();
            const w = ctx.canvas.width;
            const h = ctx.canvas.height;
            
            // Proporción de resolución (High DPI devices)
            const dpr = window.devicePixelRatio || 1;
            ctx.scale(dpr, dpr);
            const logicalW = w / dpr;
            const logicalH = h / dpr;

            // Draw Date Top Left
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            const dateStr = startDateRef.current || 'Vista Global';
            ctx.font = 'bold 36px monospace';
            const wDate = ctx.measureText(`TURBIDEZ: ${dateStr}`).width + 80;
            
            ctx.beginPath();
            ctx.roundRect(40, 40, wDate, 80, 16);
            ctx.fill();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            ctx.fillStyle = '#f8fafc';
            ctx.textAlign = 'left';
            ctx.fillText(`TURBIDEZ: ${dateStr}`, 80, 92);
            
            // Draw Legend Bottom Right (Escalado para 1920x1080)
            const lx = logicalW - 460;
            const ly = logicalH - 180;
            
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.beginPath();
            ctx.roundRect(lx, ly, 420, 140, 16);
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.fillStyle = '#cbd5e1';
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('TURBIDEZ (NTU)', lx + 210, ly + 40);
            
            const gradient = ctx.createLinearGradient(lx + 30, 0, lx + 390, 0);
            gradient.addColorStop(0, 'rgb(10,30,120)');
            gradient.addColorStop(0.13, 'rgb(0,80,220)');
            gradient.addColorStop(0.26, 'rgb(0,180,230)');
            gradient.addColorStop(0.49, 'rgb(20,220,20)');
            gradient.addColorStop(0.72, 'rgb(255,230,0)');
            gradient.addColorStop(0.85, 'rgb(255,120,0)');
            gradient.addColorStop(1, 'rgb(140,0,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(lx + 30, ly + 55, 360, 24, 12);
            ctx.fill();
            
            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 16px monospace';
            
            const positions = [
                { text: '0', x: lx + 40 },
                { text: '8', x: lx + 30 + (360 * 0.25) },
                { text: '15', x: lx + 30 + (360 * 0.50) },
                { text: '25', x: lx + 30 + (360 * 0.75) },
                { text: '30+', x: lx + 380 },
            ];
            
            positions.forEach(pos => {
                ctx.textAlign = 'center';
                ctx.fillText(pos.text, pos.x, ly + 105);
            });

            ctx.font = 'bold 12px sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.fillText('BAJO', lx + 40, ly + 125);
            ctx.fillText('BAJO', lx + 30 + (360 * 0.25), ly + 125);
            ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
            ctx.fillText('MEDIO', lx + 30 + (360 * 0.50), ly + 125);
            ctx.fillStyle = 'rgba(234, 179, 8, 0.8)';
            ctx.fillText('ALTO', lx + 30 + (360 * 0.75), ly + 125);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
            ctx.fillText('MUY ALTO', lx + 380, ly + 125);
            
            ctx.restore();
        }
    });

    // Removed movestart listener to avoid unnecessary React re-renders during panning
    // map.on('movestart', () => setClickInfo(null));
    mapInstance.current = map;

    return () => {
        if (mapInstance.current) {
            mapInstance.current.setTarget(undefined);
            mapInstance.current.dispose();
            mapInstance.current = null;
        }
    };
  }, []);

  // Fetch and Compute IDW Heatmap (Web Worker Pipeline)
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<number>(0);
  
  useEffect(() => {
    // Initialize Web Worker once
    workerRef.current = new Worker(
      new URL('../../workers/idw.worker.ts', import.meta.url),
      { type: 'module' }
    );


    return () => { workerRef.current?.terminate(); };
  }, []); // Truly stable: worker initialized once

  useEffect(() => {
    if (!startDate || !endDate) {
        if (imageLayerRef.current) imageLayerRef.current.setSource(null);
        if (pinLayerRef.current) pinLayerRef.current.getSource()?.clear();
        ptsXRef.current = new Float32Array(0);
        ptsYRef.current = new Float32Array(0);
        ptsVRef.current = new Float32Array(0);
        setClickInfo(null);
        if (onRenderCompleteRef.current) onRenderCompleteRef.current();
        return;
    }

    // Surgical Fix: Cancellation Flag to prevent Race Conditions
    let isCancelled = false;
    const controller = new AbortController();

    const fetchHeatmapData = async () => {
      try {


        const response = await fetch(
          `/api/v1/turbidity/heatmap-fast?start_date=${startDate}&end_date=${endDate}&satellite=${satellite}&algorithm=${algorithm}`,
          { signal: controller.signal }
        );
        
        // Handle non-ok responses gracefully (empty map, no crash)
        let result: any = { lons: [], lats: [], vals: [], count: 0 };
        if (response.ok) {
          try { result = await response.json(); } catch { /* bad JSON — use empty */ }
        }
        
        // CORTAFUEGOS 1: Si fue cancelado, ignorar el resto del proceso
        if (isCancelled) return;

        if (!result.lons || result.lons.length === 0) {
            imageLayerRef.current.setSource(null);
            if (pinLayerRef.current) pinLayerRef.current.getSource()?.clear();
            ptsXRef.current = new Float32Array(0);
            ptsYRef.current = new Float32Array(0);
            ptsVRef.current = new Float32Array(0);
            setClickInfo(null);

            if (onRenderCompleteRef.current) onRenderCompleteRef.current();
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
        

        
        ptsXRef.current = ptsX;
        ptsYRef.current = ptsY;
        ptsVRef.current = ptsV;

        // EL FIX DE LA PARED INVISIBLE
        // Le damos márgenes asimétricos. Muchísimo más margen hacia el Sur (minY).
        const paddingX = 1000;     // 2 km a los lados
        const paddingNorth = 2000; // 2 km hacia arriba (Norte)
        const paddingSouth = 8000; // 8 km hacia abajo (Sur) para que cubra la bahía completa

        minX -= paddingX; 
        maxX += paddingX; 
        maxY += paddingNorth; 
        minY -= paddingSouth; 

        const width = 800; 
        const height = Math.round(width * ((maxY - minY) / (maxX - minX)));

        const currentId = ++requestIdRef.current;
        if (!workerRef.current || isCancelled) return;

        // Surgical Injection: Definir el handler del worker justo antes de enviarlo
        // para capturar el valor de isCancelled de este cierre (closure)
        workerRef.current.onmessage = (e: MessageEvent) => {
          // CORTAFUEGOS 2: Ignorar respuestas del worker si el efecto ya fue limpiado
          if (isCancelled || e.data.requestId !== requestIdRef.current) return;

          const { pixelData, width: w, height: h, bounds } = e.data;
          const imgData = new ImageData(new Uint8ClampedArray(pixelData), w, h);
          
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = w; tmpCanvas.height = h;
          tmpCanvas.getContext('2d')!.putImageData(imgData, 0, 0);
          ctx.filter = 'blur(10px)';
          ctx.drawImage(tmpCanvas, 0, 0);

          // INYECCIÓN ATÓMICA Y DIRECTA: SIN ANIMACIONES
          const newSource = new Static({ 
            url: canvas.toDataURL(), 
            imageExtent: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY] 
          });
          
          // Reemplazo síncrono duro
          imageLayerRef.current.setSource(newSource);
          
          // CALLBACK SEGURO
          if (!isCancelled && onRenderCompleteRef.current) onRenderCompleteRef.current();
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
        console.error("Error fetching heatmap data:", error);
        if (!isCancelled && onRenderCompleteRef.current) onRenderCompleteRef.current();
      }
    };

    fetchHeatmapData();
    return () => {
        isCancelled = true;
        controller.abort();
    };
  }, [startDate, endDate, satellite, algorithm]);

  // --- Extreme Pin Logic ---
  const findAndPlaceExtreme = (type: 'max' | 'min') => {
    if (ptsXRef.current.length === 0 || !pinLayerRef.current || !mapInstance.current) return;

    let targetIndex = 0;
    let targetVal = type === 'max' ? -Infinity : Infinity;

   const len = ptsVRef.current.length;
    for (let i = 0; i < len; i++) {
        // CORRECCIÓN: Forzamos a que sea un número real, no un texto
        const val = Number(ptsVRef.current[i]);
        
        // Ignoramos valores nulos o inválidos que puedan romper la matemática
        if (isNaN(val)) continue;

        if (type === 'max' && val > targetVal) {
            targetVal = val;
            targetIndex = i;
        } else if (type === 'min' && val < targetVal) {
            targetVal = val;
            targetIndex = i;
        }
    }

    const x = ptsXRef.current[targetIndex];
    const y = ptsYRef.current[targetIndex];
    
    const pinFeature = new Feature({
        geometry: new Point([x, y]),
        ntu: targetVal,
        isPin: true
    });
    
    // Style override if we want min to be blue and max to be red
    pinFeature.setStyle(new Style({
        image: new CircleStyle({
            radius: 8,
            fill: new Fill({ color: type === 'max' ? '#ef4444' : '#3b82f6' }),
            stroke: new Stroke({ color: '#ffffff', width: 3 })
        })
    }));

    pinLayerRef.current.getSource()?.clear();
    pinLayerRef.current.getSource()?.addFeature(pinFeature);
    setContextMenu(null);
    
    // Open tooltip automatically immediately
    const lonLat = toLonLat([x, y]);
    let pixel = [0, 0];
    if (mapInstance.current) {
       pixel = mapInstance.current.getPixelFromCoordinate([x, y]);
    }
    setClickInfo({ ntu: targetVal, lon: lonLat[0], lat: lonLat[1], x: pixel[0], y: pixel[1], date: startDate || '' }); 
  };

  return (
    <div className="w-full h-full relative">
      <div 
        ref={mapRef} 
        className="absolute inset-0 z-0 h-full w-full bg-[#0f172a]"
        id="ol-map-container"
        onContextMenu={(e) => {
            e.preventDefault();
            if (!mapInstance.current || ptsXRef.current.length === 0) return;
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const coords = mapInstance.current.getCoordinateFromPixel([x, y]);
            
            // Block Context Menu on land (outside the GeoJSON mask)
            if (clipGeometryRef.current && !clipGeometryRef.current.intersectsCoordinate(coords)) {
                return;
            }

            const lonLat = toLonLat(coords);
            setContextMenu({ x: e.clientX, y: e.clientY, lon: lonLat[0], lat: lonLat[1] });
        }}
      />

      {/* Context Menu (Right Click) */}
      {contextMenu && (
        <>
            <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
            <div 
                className="fixed z-50 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-2 flex flex-col gap-1 w-64 animate-in fade-in zoom-in-95 duration-200"
                style={{ left: contextMenu.x, top: contextMenu.y }}
            >
               <button 
                 onClick={() => findAndPlaceExtreme('max')}
                 className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800 hover:text-white rounded-lg transition-all text-left group"
               >
                  <div className="w-3 h-3 rounded-full bg-[#ef4444] shadow-[0_0_10px_rgba(239,68,68,0.8)] border border-white/50 group-hover:scale-125 transition-transform duration-300"></div>
                  <span className="font-semibold tracking-wide">📍 {t.maxPoint}</span>
               </button>
               <div className="h-px bg-slate-800 mx-1"></div>
               <button 
                 onClick={() => findAndPlaceExtreme('min')}
                 className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800 hover:text-white rounded-lg transition-all text-left group"
               >
                  <div className="w-3 h-3 rounded-full bg-[#3b82f6] shadow-[0_0_10px_rgba(59,130,246,0.8)] border border-white/50 group-hover:scale-125 transition-transform duration-300"></div>
                  <span className="font-semibold tracking-wide">📍 {t.minPoint}</span>
               </button>
               <div className="h-px bg-slate-800 mx-1"></div>
               <button 
                 onClick={() => { setShowLabels(!showLabels); setContextMenu(null); }}
                 className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800 hover:text-white rounded-lg transition-all text-left group"
               >
                  {showLabels ? (
                     <div className="w-3 h-3 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald-400 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                     </div>
                  ) : (
                     <div className="w-3 h-3 flex items-center justify-center">
                        <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                     </div>
                  )}
                  <span className="font-semibold tracking-wide ml-1 text-slate-300">{showLabels ? t.hideZones : t.showZones}</span>
               </button>
            </div>
        </>
      )}
      
      {/* Compact Premium Glassmorphic Legend */}
      <div className="absolute top-5 left-16 md:top-auto md:bottom-10 md:left-10 z-20 pointer-events-auto">
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl p-2.5 md:p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col gap-3 min-w-[200px] md:min-w-[260px] transition-all duration-500 hover:border-emerald-500/30">
          
          {/* Legend Header - Compact */}
          <div className="flex items-center gap-2">
            <div className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]"></span>
            </div>
            <h3 className="text-[10px] md:text-[11px] font-black text-white uppercase tracking-[0.15em] opacity-80">
              {t.legendTitle}
            </h3>
          </div>

          {/* Smooth Gradient Scale */}
          <div className="space-y-2">
            <div className="relative h-2 w-full rounded-full border border-white/5 shadow-inner" 
                 style={{ background: 'linear-gradient(to right, rgb(10,30,120) 0%, rgb(0,80,220) 13%, rgb(0,180,230) 26%, rgb(20,220,20) 49%, rgb(255,230,0) 72%, rgb(255,120,0) 85%, rgb(140,0,0) 100%)' }} />

            {/* Scale Labels - Compact */}
            <div className="flex justify-between items-start px-0.5">
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold text-slate-400">0</span>
                <span className="text-[7px] text-slate-500 uppercase font-black tracking-tighter">{(t as any).legendSegments?.clear}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold text-slate-400">8</span>
                <span className="text-[7px] text-slate-500 uppercase font-black tracking-tighter">{(t as any).legendSegments?.low}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold text-emerald-400/80">15</span>
                <span className="text-[7px] text-emerald-500/60 uppercase font-black tracking-tighter">{(t as any).legendSegments?.moderate}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold text-yellow-400/80">25</span>
                <span className="text-[7px] text-yellow-500/60 uppercase font-black tracking-tighter">{(t as any).legendSegments?.high}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold text-red-500/80">30+</span>
                <span className="text-[7px] text-red-500/60 uppercase font-black tracking-tighter">{(t as any).legendSegments?.critical}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Scientific Analysis Tooltip UI */}
      {clickInfo && globalStartDate && globalEndDate && (
        <ScientificTooltip
          clickedPoint={{ lat: clickInfo.lat, lon: clickInfo.lon }}
          clickDate={clickInfo.date}
          currentDate={startDate || ''}
          startDate={globalStartDate}
          exactNtu={clickInfo.ntu}
          endDate={globalEndDate}
          onExpandRange={() => onExpandRange && onExpandRange()}
          onClose={() => {
            setClickInfo(null);
            if (pinLayerRef.current) {
                pinLayerRef.current.getSource()?.clear();
            }
          }}
          t={t}
        />
      )}
      
    </div>
  );
};

export default TurbidityMap;
