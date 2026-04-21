import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Menu } from 'lucide-react';
import JSZip from 'jszip';

import { translations, type Lang } from './i18n/translations';
import TurbidityMap from './components/Map/TurbidityMap';
import LayerSwitcher from './components/Map/LayerSwitcher';
import TimelineControls from './components/Map/TimelineControls';
import Sidebar from './components/Sidebar/Sidebar';
import LoginView from './components/Auth/LoginView';
import AdminPanel from './components/Admin/AdminPanel';
import ReportsModal from './components/Reports/ReportsModal';
import { generateInfographicBlob } from './utils/exportUtils';

function App() {
  // --- Core App State ---
  const [lang, setLang] = useState<Lang>('es');
  const t = translations[lang];

  const [currentView, setCurrentView] = useState<'map' | 'login' | 'admin'>('map');
  const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));

  // --- Map State ---
  const [baseLayer, setBaseLayer] = useState<'satellite' | 'dark' | 'light' | 'relief'>('satellite');
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isRendering, setIsRendering] = useState(false);

  // --- Date & Timeline State ---
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  // --- Satellite & Algorithm State ---
  const [satellite, setSatellite] = useState<'S2' | 'S3'>('S3');
  const [algorithm, setAlgorithm] = useState('SVR');
  
  // --- Offscreen Recording State ---
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [isRecordingBg, setIsRecordingBg] = useState(false);
  const [recStartDate, setRecStartDate] = useState('');
  const [recEndDate, setRecEndDate] = useState('');
  const [recCurrentDate, setRecCurrentDate] = useState('');
  const [recDatesList, setRecDatesList] = useState<string[]>([]);
  const [recIndex, setRecIndex] = useState(0);

  // --- Offscreen PNG Export State ---
  const [isExportingPngBg, setIsExportingPngBg] = useState(false);
  const [pngMode, setPngMode] = useState<'single'|'range'>('single');
  const [pngStartDate, setPngStartDate] = useState('');
  const [pngEndDate, setPngEndDate] = useState('');
  const [pngCurrentDate, setPngCurrentDate] = useState('');
  const [pngDatesList, setPngDatesList] = useState<string[]>([]);
  const [pngIndex, setPngIndex] = useState(0);
  const pngZipRef = useRef<JSZip | null>(null);

  // Fetch Available Dates (re-fetch when satellite or algorithm changes)
  useEffect(() => {
    const fetchAvailableDates = async () => {
      try {
        const res = await fetch(`/api/v1/turbidity/available-dates?satellite=${satellite}&algorithm=${algorithm}`);
        if (res.ok) {
          const data = await res.json();
          setAvailableDates(data.dates);
        }
      } catch (e) {
        console.error("Error fetching dates:", e);
      }
    };
    fetchAvailableDates();
    // Reset timeline state when satellite/algorithm changes
    setCurrentDate('');
    setShowTimeline(false);
    setIsPlaying(false);
    setSliderValue(0);
  }, [satellite, algorithm]);

  // Sidebar persistence Logic (Open automatically on desktop resize)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) { // md breakpoint
        setSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    // Also run once on mount to ensure correct state
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Reports Modal ---
  const [showReportsModal, setShowReportsModal] = useState(false);

  // --- Derived State for Timeline ---
  const activeRangeDates = useMemo(() => {
    if (!startDate || !endDate || dateMode !== 'range') return [];
    return availableDates
      .filter(d => d >= startDate && d <= endDate)
      .sort();
  }, [availableDates, startDate, endDate, dateMode]);

  // --- Timeline Logic ---
  const handleAcceptCalendar = useCallback(() => {
    setShowCalendar(false);
    if (dateMode === 'single') {
      setIsRendering(true);
      setCurrentDate(startDate);
    } else {
      if (activeRangeDates.length > 0) {
        setIsRendering(true);
        setCurrentDate(activeRangeDates[0]);
        setSliderValue(0);
      } else {
        setIsRendering(true);
        setCurrentDate(startDate);
      }
    }
    setShowTimeline(true);
  }, [dateMode, startDate, activeRangeDates]);

  const handleSliderChange = useCallback((value: number) => {
    setSliderValue(value);
    setIsPlaying(false);
    
    if (dateMode === 'range' && activeRangeDates.length > 0) {
      // Step through available dates based on slider index
      const index = Math.min(value, activeRangeDates.length - 1);
      setIsRendering(true);
      setCurrentDate(activeRangeDates[index]);
    } else if (startDate && endDate) {
      // Fallback to interpolation if no availableDates filtering (not expected with new logic)
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      const interpolated = new Date(start + (end - start) * (value / 100));
      setIsRendering(true);
      setCurrentDate(interpolated.toISOString().split('T')[0]);
    }
  }, [startDate, endDate, dateMode, activeRangeDates]);

  const handleCloseTimeline = useCallback(() => {
    setShowTimeline(false);
    setIsPlaying(false);
    setSliderValue(0);
    setCurrentDate('');
  }, []);

  const handleExpandRange = useCallback(() => {
    if (!startDate || !endDate) return;
    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    sDate.setUTCMonth(sDate.getUTCMonth() - 1);
    eDate.setUTCMonth(eDate.getUTCMonth() + 1);
    setStartDate(sDate.toISOString().split('T')[0]);
    setEndDate(eDate.toISOString().split('T')[0]);
  }, [startDate, endDate]);

  // Watchdog to clear isRendering if it gets stuck (e.g. worker crash or network hang)
  useEffect(() => {
    if (!isRendering) return;
    const watchdog = setTimeout(() => {
      console.warn("Watchdog: Heatmap rendering took too long (>10s), clearing lock.");
      setIsRendering(false);
    }, 10000);
    return () => clearTimeout(watchdog);
  }, [isRendering]);

  // Auto-play effect with strict render synchronization
  useEffect(() => {
    if (!isPlaying || isRendering || dateMode !== 'range' || activeRangeDates.length === 0) return;
    
    // Schedule NEXT frame only when NOT currently rendering
    const timer = setTimeout(() => {
      // Apply the render lock synchronously before updating the date
      setIsRendering(true);
      
      setSliderValue(prev => {
        const next = prev + 1;
        if (next >= activeRangeDates.length) {
          // Loop back to start normally
          setCurrentDate(activeRangeDates[0]);
          return 0; 
        }
        setCurrentDate(activeRangeDates[next]);
        return next;
      });
    }, 1200); // 1.2s between frames
    
    return () => clearTimeout(timer);
  }, [isPlaying, isRendering, dateMode, activeRangeDates]);

  // Global Event Listener for Start Recording Request (From ReportsModal)
  useEffect(() => {
    const handleStartRecording = (e: any) => {
      const { startDate: rStart, endDate: rEnd } = e.detail;
      const datesToRecord = availableDates.filter(d => d >= rStart && d <= rEnd).sort();
      if (datesToRecord.length === 0) {
        alert("No hay datos en este rango para grabar.");
        return;
      }

      setRecStartDate(rStart);
      setRecEndDate(rEnd);
      setRecDatesList(datesToRecord);
      setRecCurrentDate(datesToRecord[0]);
      setRecIndex(0);
      setIsRecordingBg(true);
    };

    window.addEventListener('start-timeline-recording', handleStartRecording);
    return () => window.removeEventListener('start-timeline-recording', handleStartRecording);
  }, [availableDates]);

  // Offscreen Renderer Callback triggered by the hidden map
  const handleRecordingFrameComplete = useCallback(() => {
     if (!isRecordingBg) return;

     if (!recorderRef.current || recorderRef.current.state === 'inactive') {
        const mapContainer = document.querySelector('#offscreen-recorder-map');
        if (!mapContainer) return;
        const canvas = mapContainer.querySelector('.ol-layer canvas') as HTMLCanvasElement;
        if (!canvas) return;

        const stream = canvas.captureStream(30);
        
        let options = { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 50000000 };
        if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
            options = { mimeType: 'video/webm', videoBitsPerSecond: 50000000 };
        }
        const recorder = new MediaRecorder(stream, options);
        
        const chunks: Blob[] = [];
        recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };
        
        recorder.onstop = () => {
           (window as any).__isRecordingBgMap = false;
           const blob = new Blob(chunks, { type: 'video/webm' });
           const url = URL.createObjectURL(blob);
           const a = document.createElement('a');
           a.href = url;
           a.download = `Evolucion_Turbidez_${recStartDate}_a_${recEndDate}.webm`;
           a.click();
           URL.revokeObjectURL(url);
           setIsRecordingBg(false);
           recorderRef.current = null;
        };

        recorderRef.current = recorder;
        (window as any).__isRecordingBgMap = true; // Tell map to draw Legend overlays!
        recorder.start();
     }

     // Move to next frame after enough interval 
     setTimeout(() => {
        setRecIndex(prev => {
           const next = prev + 1;
           if (next >= recDatesList.length) {
              if (recorderRef.current && recorderRef.current.state === 'recording') {
                 recorderRef.current.stop();
              }
              return prev;
           }
           setRecCurrentDate(recDatesList[next]);
           return next;
        });
     }, 1000);

  }, [isRecordingBg, recDatesList, recStartDate, recEndDate]);

  // Global Event Listener for PNG Export Request
  useEffect(() => {
    const handleStartExportPng = (e: any) => {
      const { mode, startDate: eStart, endDate: eEnd } = e.detail;
      const datesToExport = availableDates.filter(d => d >= eStart && d <= eEnd).sort();
      if (datesToExport.length === 0) {
        alert("No hay datos en este rango para exportar.");
        return;
      }

      setPngMode(mode);
      setPngStartDate(eStart);
      setPngEndDate(eEnd);
      setPngDatesList(datesToExport);
      setPngCurrentDate(datesToExport[0]);
      setPngIndex(0);
      pngZipRef.current = mode === 'range' ? new JSZip() : null;
      setIsExportingPngBg(true);
    };

    window.addEventListener('start-timeline-export-png', handleStartExportPng);
    return () => window.removeEventListener('start-timeline-export-png', handleStartExportPng);
  }, [availableDates]);

  // Offscreen Renderer Callback for PNG
  const handleExportPngFrameComplete = useCallback(async () => {
     if (!isExportingPngBg) return;

     const mapContainer = document.querySelector('#offscreen-png-map');
     if (!mapContainer) return;
     const canvas = mapContainer.querySelector('.ol-layer canvas') as HTMLCanvasElement;
     if (!canvas) return;

     try {
       // We must wait a tiny bit to ensure OpenLayers fully flipped its buffers
       await new Promise(r => setTimeout(r, 600));

       const blob = await generateInfographicBlob(canvas, pngCurrentDate);
       
       if (pngMode === 'single') {
          // Download directly
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Reporte_TurbidezApp_${pngCurrentDate}.png`;
          a.click();
          URL.revokeObjectURL(url);
          setIsExportingPngBg(false);
       } else {
          // Add to ZIP
          pngZipRef.current?.file(`Reporte_TurbidezApp_${pngCurrentDate}.png`, blob);
          
          // Next frame or finish
          const nextIdx = pngIndex + 1;
          if (nextIdx >= pngDatesList.length) {
             // Finish ZIP
             const zipBlob = await pngZipRef.current?.generateAsync({ type: 'blob' });
             if (zipBlob) {
                const url = URL.createObjectURL(zipBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Reportes_Multiples_TurbidezApp_${pngStartDate}_a_${pngEndDate}.zip`;
                a.click();
                URL.revokeObjectURL(url);
             }
             setIsExportingPngBg(false);
          } else {
             setPngIndex(nextIdx);
             setPngCurrentDate(pngDatesList[nextIdx]);
          }
       }
     } catch (e) {
       console.error("PNG Export Failed:", e);
       alert("Error generando Snapshot PNG.");
       setIsExportingPngBg(false);
     }
  }, [isExportingPngBg, pngMode, pngCurrentDate, pngStartDate, pngEndDate, pngIndex, pngDatesList]);

  // --- Auth Handlers ---
  const handleLoginSuccess = useCallback((newToken: string) => {
    setToken(newToken);
    setCurrentView('admin');
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('admin_token');
    setToken(null);
    setCurrentView('map');
  }, []);

  const handleLoginClick = useCallback(() => {
    if (token) { setCurrentView('admin'); }
    else { setCurrentView('login'); }
  }, [token]);

  return (
    <div className="w-screen h-screen bg-slate-950 flex overflow-hidden relative">

      {/* Sidebar Toggle (Mobile only) */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`absolute top-5 left-5 z-40 p-2.5 bg-slate-900/80 backdrop-blur-md border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all shadow-xl pointer-events-auto md:hidden ${sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Sidebar */}
      <Sidebar
        t={t}
        lang={lang}
        isOpen={sidebarOpen}
        selectedSatellite={satellite}
        selectedAlgorithm={algorithm}
        onClose={() => setSidebarOpen(false)}
        onToggleLang={() => setLang(lang === 'es' ? 'en' : 'es')}
        onLoginClick={handleLoginClick}
        onOpenReports={() => setShowReportsModal(true)}
        onSatelliteChange={(sat) => {
          setSatellite(sat);
          // Auto-switch to default algorithm for the new satellite
          setAlgorithm(sat === 'S2' ? 'Nechad2009' : 'SVR');
        }}
        onAlgorithmChange={setAlgorithm}
      />

      {/* Main Map Content */}
      <div className="flex-1 relative w-full h-full ml-0">
        <TurbidityMap
          lang={lang}
          baseLayerType={baseLayer}
          startDate={currentDate}
          endDate={currentDate}
          globalStartDate={startDate}
          globalEndDate={endDate}
          satellite={satellite}
          algorithm={algorithm}
          onRenderComplete={() => setIsRendering(false)}
          onMapInteraction={() => setIsPlaying(false)}
          onExpandRange={handleExpandRange}
        />

        {/* Layer Switcher */}
        <LayerSwitcher
          t={t}
          baseLayer={baseLayer}
          showMenu={showLayerMenu}
          onToggleMenu={() => setShowLayerMenu(!showLayerMenu)}
          onChangeLayer={(layer) => { setBaseLayer(layer); setShowLayerMenu(false); }}
        />

        {/* Timeline Controls */}
        <TimelineControls
          t={t}
          showCalendar={showCalendar}
          showTimeline={showTimeline}
          dateMode={dateMode}
          startDate={startDate}
          endDate={endDate}
          currentDate={currentDate}
          sliderValue={sliderValue}
          isPlaying={isPlaying}
          availableDates={availableDates}
          onToggleCalendar={() => setShowCalendar(!showCalendar)}
          onSetDateMode={setDateMode}
          onSetStartDate={setStartDate}
          onSetEndDate={setEndDate}
          onAcceptCalendar={handleAcceptCalendar}
          onSliderChange={(val) => handleSliderChange(val)}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onCloseTimeline={handleCloseTimeline}
          onExpandRange={handleExpandRange}
          maxSliderValue={dateMode === 'range' && activeRangeDates.length > 1 ? activeRangeDates.length - 1 : 100}
        />
      </div>

      {/* Offscreen Recorder Map (Hidden 1920x1080) */}
      {isRecordingBg && (
        <div id="offscreen-recorder-map" style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '1920px', height: '1080px', pointerEvents: 'none', zIndex: -9999 }}>
            <TurbidityMap
              lang={lang}
              baseLayerType={baseLayer}
              startDate={recCurrentDate}
              endDate={recCurrentDate}
              globalStartDate={recStartDate}
              globalEndDate={recEndDate}
              onRenderComplete={handleRecordingFrameComplete}
            />
        </div>
      )}

      {/* Video Recording Progress Overlay */}
      {isRecordingBg && (
        <div className="fixed inset-0 z-[10000] bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center text-white">
          <div className="relative w-24 h-24 mb-8">
             <div className="absolute inset-0 rounded-full border-4 border-slate-700"></div>
             <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
             <div className="absolute inset-0 flex items-center justify-center">
                 <span className="text-emerald-400 font-bold text-lg">{Math.round((recIndex / Math.max(1, recDatesList.length)) * 100)}%</span>
             </div>
          </div>
          <h2 className="text-2xl font-black tracking-wider mb-2">COMPILANDO ANIMACIÓN</h2>
          <p className="text-slate-400 text-center max-w-md">Renderizando frames fotogramétricos en Alta Definición por GPU.<br/>Por favor espere, la descarga comenzará automáticamente.</p>
        </div>
      )}

      {/* Offscreen PNG Map (Hidden 1920x1080) */}
      {isExportingPngBg && (
        <div id="offscreen-png-map" style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '1920px', height: '1080px', pointerEvents: 'none', zIndex: -9999 }}>
            <TurbidityMap
              lang={lang}
              baseLayerType={baseLayer}
              startDate={pngCurrentDate}
              endDate={pngCurrentDate}
              globalStartDate={pngStartDate}
              globalEndDate={pngEndDate}
              onRenderComplete={handleExportPngFrameComplete}
            />
        </div>
      )}

      {/* Login View Overlay */}
      {currentView === 'login' && (
        <LoginView
          t={t}
          lang={lang}
          onLoginSuccess={handleLoginSuccess}
          onBack={() => setCurrentView('map')}
        />
      )}

      {/* Admin Panel Overlay */}
      {currentView === 'admin' && token && (
        <AdminPanel
          t={t}
          lang={lang}
          token={token}
          onLogout={handleLogout}
          onToggleLang={() => setLang(lang === 'es' ? 'en' : 'es')}
        />
      )}

      {/* Reports Modal */}
      {showReportsModal && (
        <ReportsModal
          t={t}
          currentDate={currentDate}
          availableDates={availableDates}
          satellite={satellite}
          algorithm={algorithm}
          onClose={() => setShowReportsModal(false)}
          onApplyDates={(mode: 'single' | 'range', start: string, end: string) => {
            setDateMode(mode);
            setStartDate(start);
            setEndDate(end);
            
            // Re-initialize timeline and map to ensure the UI updates
            if (mode === 'single') {
              setIsRendering(true);
              setCurrentDate(start);
            } else {
              setIsRendering(true);
              setCurrentDate(start); // Will auto-correct via activeRangeDates in slider
              setSliderValue(0);
            }
            setShowTimeline(true);
            setShowReportsModal(false);
          }}
        />
      )}
    </div>
  );
}

export default App;