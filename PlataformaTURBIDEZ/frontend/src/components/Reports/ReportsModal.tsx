import { useState, useMemo, useEffect } from 'react';
import { X, BarChart3, Activity, Download, Map as MapIcon, Info, RefreshCw, Layers as LayersIcon, Video, LineChart } from 'lucide-react';
import type { TranslationSet } from '../../i18n/translations';
import * as api from '../../services/api';
import CustomCalendar from '../Map/CustomCalendar';
import StaticMapThumbnail from './StaticMapThumbnail';
import { ResponsiveContainer, XAxis, YAxis, Tooltip, LineChart as RechartsLineChart, Line, CartesianGrid, PieChart, Pie, BarChart, Bar, Legend, AreaChart, Area, ReferenceLine } from 'recharts';

interface ReportsModalProps {
  t: TranslationSet;
  currentDate: string;
  onClose: () => void;
  availableDates: string[];
  satellite?: 'S2' | 'S3';
  algorithm?: string;
  onApplyDates?: (mode: 'single'|'range', start: string, end: string) => void;
}

const ReportsModal = ({ t, currentDate, onClose, availableDates, satellite = 'S3', algorithm = 'SVR', onApplyDates }: ReportsModalProps) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'comparative' | 'export'>('dashboard');

  // --- TAB 1: Dashboard State ---
  const [dashMode, setDashMode] = useState<'single' | 'range'>('single');
  const [dashStartDate, setDashStartDate] = useState(currentDate);
  const [dashEndDate, setDashEndDate] = useState(currentDate);
  const [isGeneratingDash, setIsGeneratingDash] = useState(false);
  const [dashData, setDashData] = useState<any>(null);
  const [dashChartTab, setDashChartTab] = useState<'histogram' | 'bar'>('bar');

  // --- TAB 2: Comparative State ---
  const [compDateA, setCompDateA] = useState(currentDate);
  const [compDateB, setCompDateB] = useState(currentDate);
  const [isGeneratingComp, setIsGeneratingComp] = useState(false);
  const [compData, setCompData] = useState<any>(null);
  const [showCompCalendarA, setShowCompCalendarA] = useState(false);
  const [showCompCalendarB, setShowCompCalendarB] = useState(false);

  // --- TAB 3: Export State ---
  const [exportModeSelection, setExportModeSelection] = useState<'all' | 'range' | 'single'>('range');
  const [exportStartDate, setExportStartDate] = useState(currentDate);
  const [exportEndDate, setExportEndDate] = useState(currentDate);
  const [showExportCalendar, setShowExportCalendar] = useState(false);
  const [reportFormat, setReportFormat] = useState('csv');
  const [exportSatellite, setExportSatellite] = useState<'S2' | 'S3'>(satellite);
  const [exportAlgorithm, setExportAlgorithm] = useState<string>(algorithm);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  
  const [exportAvailableDates, setExportAvailableDates] = useState<string[]>(availableDates);

  useEffect(() => {
    const fetchExportDates = async () => {
      try {
        const res = await fetch(`/api/v1/turbidity/available-dates?satellite=${exportSatellite}&algorithm=${exportAlgorithm}`);
        if (res.ok) {
          const data = await res.json();
          setExportAvailableDates(data.dates || []);
          
          // Auto-adjust start/end dates if they fall outside the new available dates or are not in the list
          if (data.dates && data.dates.length > 0) {
              if (exportModeSelection === 'single' && !data.dates.includes(exportStartDate)) {
                  setExportStartDate(data.dates[0]);
                  setExportEndDate(data.dates[0]);
              } else if (exportModeSelection === 'range') {
                  let s = exportStartDate;
                  let e = exportEndDate;
                  if (!data.dates.includes(s)) s = data.dates[0];
                  if (!data.dates.includes(e)) e = data.dates[data.dates.length - 1];
                  if (s > e) e = s;
                  setExportStartDate(s);
                  setExportEndDate(e);
              }
          }
        }
      } catch (e) {
        console.error("Error fetching export dates:", e);
      }
    };

    if (exportSatellite !== satellite || exportAlgorithm !== algorithm) {
        fetchExportDates();
    } else {
        setExportAvailableDates(availableDates);
    }
  }, [exportSatellite, exportAlgorithm, satellite, algorithm, availableDates, exportModeSelection, exportStartDate, exportEndDate]);

  // === MEMOIZED DATA FOR PERFORMANCE ===
  const dashChartData = useMemo(() => {
    if (!dashData || !dashData.dist) return [];
    return [
      { name: 'Bajo', labelBar: 'Bajo (0-4)', value: Number(dashData.dist.low.toFixed(1)), fill: '#38bdf8' },
      { name: 'Medio', labelBar: 'Medio (4-10)', value: Number(dashData.dist.med.toFixed(1)), fill: '#10b981' },
      { name: 'Alto', labelBar: 'Alto (+10)', value: Number(dashData.dist.high.toFixed(1)), fill: '#ef4444' }
    ];
  }, [dashData]);

  const frequenciesTotalCount = useMemo(() => {
    if (!dashData || !dashData.frequencies) return 1;
    return dashData.frequencies.reduce((sum: number, item: any) => sum + item.count, 0) || 1;
  }, [dashData]);

  // === DASHBOARD LOGIC ===
  const generateDashboardReport = async () => {
    setIsGeneratingDash(true);
    setDashData(null);
    try {
      const stats = await api.fetchRangeStats(dashStartDate, dashEndDate, satellite, algorithm);
      setDashData(stats);
    } catch (e) {
      console.error(e);
    }
    setIsGeneratingDash(false);
  };

  // === COMPARATIVE LOGIC ===
  const generateComparativeReport = async () => {
    setIsGeneratingComp(true);
    setCompData(null);
    try {
      const dataA = await api.fetchRangeStats(compDateA, compDateA, satellite, algorithm);
      const dataB = await api.fetchRangeStats(compDateB, compDateB, satellite, algorithm);
      
      if (dataA && !dataA.empty && dataB && !dataB.empty) {
        const deltaMean = dataB.mean - dataA.mean;
        const deltaPercent = (deltaMean / dataA.mean) * 100;
        
        setCompData({
          empty: false,
          dayA: dataA,
          dayB: dataB,
          deltaMean,
          deltaPercent
        });
      } else {
        setCompData({ empty: true });
      }
    } catch (e) {
      console.error(e);
      setCompData({ empty: true });
    }
    setIsGeneratingComp(false);
  };

  // === EXPORT LOGIC ===
  const handleDownloadHistoricalReport = () => {
    setIsDownloadingReport(true);
    const opts: api.DownloadPublicOpts = { format: reportFormat, satellite: exportSatellite, algorithm: exportAlgorithm };

    if (exportModeSelection === 'range') {
      if (exportStartDate) opts.startDate = exportStartDate;
      if (exportEndDate) opts.endDate = exportEndDate;
    } else if (exportModeSelection === 'single') {
      if (exportStartDate) { opts.startDate = exportStartDate; opts.endDate = exportStartDate; }
    }

    setTimeout(() => {
      const url = api.buildPublicDownloadUrl(opts);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `turbidity_report.${reportFormat}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsDownloadingReport(false);
    }, 1000);
  };

  const handleDownloadMapImage = async () => {
    setIsDownloadingReport(true);
    const rStart = exportModeSelection === 'all' ? exportAvailableDates[0] : exportStartDate;
    const rEnd = exportModeSelection === 'all' ? exportAvailableDates[exportAvailableDates.length - 1] : exportEndDate;

    const evtObj = {
        mode: exportModeSelection,
        startDate: rStart,
        endDate: rEnd,
        satellite: exportSatellite,
        algorithm: exportAlgorithm
    };

    // Wait for state to settle, then fire event and close modal
    setTimeout(() => {
        setIsDownloadingReport(false);
        onClose(); // Close ReportsModal
        window.dispatchEvent(new CustomEvent('start-timeline-export-png', { detail: evtObj }));
    }, 500);
  };

  const handleRecordVideo = async () => {
    setIsRecordingVideo(true);
    
    // Determine the export range
    const rStart = exportModeSelection === 'all' ? exportAvailableDates[0] : exportStartDate;
    const rEnd = exportModeSelection === 'all' ? exportAvailableDates[exportAvailableDates.length - 1] : exportEndDate;
    
    // We emit a CustomEvent to be caught by the App / Map component.
    const startObj = { startDate: rStart, endDate: rEnd, satellite: exportSatellite, algorithm: exportAlgorithm };
    
    // Wait for state to settle, then fire event and close modal
    setTimeout(() => {
        setIsRecordingVideo(false);
        onClose(); // Close ReportsModal
        window.dispatchEvent(new CustomEvent('start-timeline-recording', { detail: startObj }));
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/90">
      <div className="flex flex-col w-full max-w-[1400px] h-[95vh] bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl">

        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-900 shadow-sm relative z-10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-purple-500/20 p-2.5 rounded-xl border border-purple-500/30">
              <BarChart3 className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t.reportsTitle}</h2>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-0.5">{t.reportsSubtitle}</p>
            </div>
          </div>

          <div className="bg-slate-950 p-1.5 rounded-xl border border-slate-800 hidden md:flex">
            <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${activeTab === 'dashboard' ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.3)]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              <Activity className="w-4 h-4" /> {t.tabDashboard}
            </button>
            <button onClick={() => setActiveTab('comparative')} className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${activeTab === 'comparative' ? 'bg-sky-600 text-white shadow-[0_0_15px_rgba(2,132,199,0.3)]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              <LayersIcon className="w-4 h-4" /> {t.tabComparative}
            </button>
            <button onClick={() => setActiveTab('export')} className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${activeTab === 'export' ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(5,150,105,0.3)]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              <Download className="w-4 h-4" /> {t.tabExport}
            </button>
          </div>

          <button onClick={onClose} className="p-2 bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <>
              
              {/* Left Settings */}
              <div className="flex flex-col w-full lg:w-[380px] shrink-0 bg-slate-800/20 border-r border-slate-700/50 p-4 sm:p-6 overflow-y-auto">
                <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-inner flex flex-col shrink-0">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <LineChart className="w-4 h-4 text-purple-400" /> {t.dynamicAnalysis}
                  </h3>
                  
                    <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-lg mb-4">
                      <button onClick={() => setDashMode('single')} className={`flex-1 text-[11px] py-1.5 rounded-md font-bold uppercase transition-all ${dashMode === 'single' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                        {t.singleDateModeExport}
                      </button>
                      <button onClick={() => setDashMode('range')} className={`flex-1 text-[11px] py-1.5 rounded-md font-bold uppercase transition-all ${dashMode === 'range' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                        {t.rangeDateMode}
                      </button>
                    </div>

                    <div className="grow overflow-y-auto mb-4 custom-scrollbar flex flex-col">
                      <div className="transform-gpu scale-[0.9] origin-top shrink-0">
                      <CustomCalendar
                        dateMode={dashMode}
                        startDate={dashStartDate}
                        endDate={dashEndDate}
                        availableDates={availableDates}
                        onSelect={(start: string, end: string) => { setDashStartDate(start); setDashEndDate(end); }}
                        t={t as any}
                      />
                      </div>
                    </div>
                    
                    <button onClick={generateDashboardReport} disabled={isGeneratingDash} className="w-full mt-2 mb-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_0_20px_rgba(147,51,234,0.3)] flex justify-center items-center gap-2 text-xs tracking-widest border-b-[3px] border-purple-800 active:border-b-0 active:translate-y-[3px]">
                      {isGeneratingDash ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><BarChart3 className="w-4 h-4" /> GENERAR ANÁLISIS</>}
                    </button>

                    {dashData && !dashData.empty && (
                       <div className="mt-auto pt-4 border-t border-slate-800 flex justify-center">
                           <button
                             onClick={() => onApplyDates && onApplyDates(dashMode, dashStartDate, dashEndDate)}
                             className="flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:border-emerald-400 font-bold py-2.5 px-6 rounded-lg transition-all text-xs tracking-widest shrink-0 w-full shadow-[0_4px_15px_rgba(16,185,129,0.1)] hover:shadow-[0_4px_25px_rgba(16,185,129,0.2)]"
                           >
                             <MapIcon className="w-4 h-4" />
                             <span>{(t as any).visualizeMap || 'Aplicar al Mapa 3D'}</span>
                           </button>
                       </div>
                    )}
                </div>
              </div>

              {/* Right Results */}
              <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-slate-900 custom-scrollbar">
                <div className="flex flex-col space-y-8 max-w-7xl mx-auto min-h-full">
                {!dashData ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                    <Activity className="w-20 h-20 opacity-20" />
                    <span className="text-sm font-bold uppercase tracking-widest">{t.selectRangeDate}</span>
                  </div>
                ) : dashData.empty ? (
                   <div className="flex flex-col items-center justify-center h-full text-red-400 gap-4">
                    <Info className="w-20 h-20 opacity-50" />
                    <span className="text-sm font-bold uppercase tracking-widest">{t.noDataReport}</span>
                  </div>
                ) : (
                  <div className="animate-in fade-in zoom-in-95 duration-500 flex flex-col h-full gap-8">
                    {/* Glassmorphic Metrics Grid */}
                    {/* Glassmorphic Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                       <div className="bg-slate-950/50 backdrop-blur-md p-4 flex flex-col justify-between min-h-[120px] rounded-2xl border border-sky-500/20 shadow-[0_4px_30px_rgba(2,132,199,0.1)] text-center relative group z-10 hover:z-50">
                          <span className="text-[10px] text-sky-400 uppercase tracking-widest mb-1 font-bold flex items-center justify-center gap-1 cursor-help">
                             {t.average}
                             <Info className="w-3 h-3 opacity-70" />
                          </span>
                          <div className="absolute top-[110%] left-1/2 -translate-x-1/2 mt-1 w-64 p-3 bg-slate-800 text-xs text-slate-200 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-2xl border border-sky-500/30 font-normal normal-case whitespace-normal">
                             {(t as any).avgNtuDesc || 'Concentración media de material particulado. Establece la condición base de turbidez en el periodo seleccionado.'}
                          </div>
                          <span className="text-3xl font-mono transform-gpu text-white font-bold mt-auto">{dashData.mean.toFixed(2)}<span className="text-xs ml-1 text-slate-500 break-keep">NTU</span></span>
                       </div>
                       <div className="bg-slate-950/50 backdrop-blur-md p-4 flex flex-col justify-between min-h-[120px] rounded-2xl border border-emerald-500/20 shadow-[0_4px_30px_rgba(16,185,129,0.1)] text-center relative group z-10 hover:z-50">
                          <span className="text-[10px] text-emerald-400 uppercase tracking-widest mb-1 font-bold flex items-center justify-center gap-1 cursor-help">
                             {t.maximum}
                             <Info className="w-3 h-3 opacity-70" />
                          </span>
                          <div className="absolute top-[110%] left-1/2 -translate-x-1/2 mt-1 w-64 p-3 bg-slate-800 text-xs text-slate-200 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-2xl border border-emerald-500/30 font-normal normal-case whitespace-normal">
                             {(t as any).maxNtuDesc || 'Valor máximo de turbidez (NTU) registrado en el periodo seleccionado.'}
                          </div>
                          <span className="text-3xl font-mono transform-gpu text-white font-bold mt-auto">{dashData.max.toFixed(2)}<span className="text-xs ml-1 text-slate-500 break-keep">NTU</span></span>
                          <span className="text-[9px] font-mono text-emerald-600/80 mt-1 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full inline-block mx-auto">{dashData.max_date}</span>
                       </div>
                       <div className="bg-slate-950/50 backdrop-blur-md p-4 flex flex-col justify-between min-h-[120px] rounded-2xl border border-blue-500/20 shadow-[0_4px_30px_rgba(59,130,246,0.1)] text-center relative group z-10 hover:z-50">
                          <span className="text-[10px] text-blue-400 uppercase tracking-widest mb-1 font-bold flex items-center justify-center gap-1 cursor-help">
                             {t.minimum || 'MÍNIMO'}
                             <Info className="w-3 h-3 opacity-70" />
                          </span>
                          <div className="absolute top-[110%] left-1/2 -translate-x-1/2 mt-1 w-64 p-3 bg-slate-800 text-xs text-slate-200 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-2xl border border-blue-500/30 font-normal normal-case whitespace-normal">
                             {(t as any).minNtuDesc || 'Valor mínimo de turbidez (NTU) registrado en el periodo seleccionado.'}
                          </div>
                          <span className="text-3xl font-mono transform-gpu text-white font-bold mt-auto">{dashData.min.toFixed(2)}<span className="text-xs ml-1 text-slate-500 break-keep">NTU</span></span>
                          <span className="text-[9px] font-mono text-blue-600/80 mt-1 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded-full inline-block mx-auto">{dashData.min_date}</span>
                       </div>
                       <div className="bg-slate-950/50 backdrop-blur-md p-4 flex flex-col justify-between min-h-[120px] rounded-2xl border border-orange-500/20 shadow-[0_4px_30px_rgba(249,115,22,0.1)] text-center relative group z-10 hover:z-50">
                          <span className="text-[10px] text-orange-400 uppercase tracking-widest mb-1 font-bold flex items-center justify-center gap-1 cursor-help">
                             <span className="truncate">{t.p90}</span>
                             <Info className="w-3 h-3 opacity-70" />
                          </span>
                          <div className="absolute top-[110%] md:left-1/2 md:-translate-x-1/2 right-0 mt-1 w-64 p-3 bg-slate-800 text-xs text-slate-200 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-2xl border border-orange-500/30 font-normal normal-case whitespace-normal">
                             {(t as any).p90Tooltip || 'El 90% del tiempo/área la turbidez se mantiene debajo de este umbral. Ignora el ruido extremo.'}
                          </div>
                          <span className="text-3xl font-mono transform-gpu text-white font-bold mt-auto">{dashData.p90.toFixed(2)}<span className="text-xs ml-1 text-slate-500 break-keep">NTU</span></span>
                       </div>
                       <div className="bg-slate-950/50 backdrop-blur-md p-4 flex flex-col justify-between min-h-[120px] rounded-2xl border border-purple-500/20 shadow-[0_4px_30px_rgba(147,51,234,0.1)] text-center relative group z-10 hover:z-50">
                          <span className="text-[10px] text-purple-400 uppercase tracking-widest mb-1 font-bold flex items-center justify-center gap-1 cursor-help">
                             {t.cv}
                             <Info className="w-3 h-3 opacity-70" />
                          </span>
                          <div className="absolute top-[110%] right-0 lg:left-0 lg:-translate-x-1/2 mt-1 w-64 p-3 bg-slate-800 text-xs text-slate-200 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-2xl border border-purple-500/30 font-normal normal-case whitespace-normal">
                             {(t as any).cvTooltip || 'Coeficiente de variación. Valores >50% indican alta variabilidad en las mediciones de turbidez.'}
                          </div>
                          <span className="text-3xl font-mono transform-gpu text-white font-bold mt-auto">{dashData.cv.toFixed(1)}<span className="text-xs ml-1 text-slate-500 break-keep">%</span></span>
                       </div>
                    </div>

                    {/* Dynamic Charts Section */}
                    <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-[300px]">
                       
                       {/* Timeseries Trend */}
                       {dashData.timeseries && dashData.timeseries.length > 0 && (
                         <div className="flex-[2] bg-slate-950 rounded-2xl border border-slate-800 p-6 flex flex-col">
                            <span className="text-sm text-slate-400 uppercase tracking-widest font-bold mb-6 flex items-center gap-2 group cursor-help relative w-fit z-10 hover:z-50">
                               {(t as any).timeSeriesDesc || 'Evolución Espacio-Temporal'}
                               <Info className="w-4 h-4 opacity-70" />
                               <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-slate-200 text-xs p-4 rounded-xl top-[110%] w-72 z-50 pointer-events-none shadow-2xl border border-purple-500/30 left-0 whitespace-normal font-normal normal-case">
                                 {(t as any).timeSeriesTooltip || 'Muestra la evolución del promedio a lo largo de los días.'}
                               </div>
                            </span>
                            <div className="flex-1 w-full" style={{ minHeight: '250px' }}>
                               <ResponsiveContainer width="100%" height={250}>
                                  <BarChart data={dashData.timeseries || []} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                                    <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickMargin={10} minTickGap={20} />
                                    <YAxis stroke="#64748b" fontSize={12} domain={[0, 'auto']} tickFormatter={(val) => typeof val === 'number' ? val.toFixed(1) : val} />
                                    <Tooltip 
                                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(147, 51, 234, 0.3)', borderRadius: '12px', fontSize: '13px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                                      itemStyle={{ color: '#c084fc', fontWeight: 'bold' }}
                                      labelStyle={{ color: '#94a3b8', marginBottom: '6px' }}
                                      formatter={(value: any) => [typeof value === 'number' ? `${value.toFixed(2)} NTU` : `${value} NTU`, 'Turbidez Promedio']}
                                    />
                                    <ReferenceLine y={dashData.mean} stroke="#f43f5e" strokeWidth={2} strokeDasharray="3 3">
                                        <text x={0} y={-5} fill="#f43f5e" fontSize={10} fontWeight="bold">MEDIA: {dashData.mean?.toFixed(1)}</text>
                                    </ReferenceLine>
                                    <Bar dataKey="ntu" fill="#c084fc" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                  </BarChart>
                               </ResponsiveContainer>
                            </div>
                         </div>
                       )}

                       {/* Content Distribution Multi-Chart Tab */}
                       <div className="flex-1 bg-slate-950 rounded-2xl border border-slate-800 p-6 flex flex-col justify-center gap-5">
                            <div className="flex items-center justify-between mb-2 border-b border-slate-800/50 pb-3">
                               <span className="text-sm text-slate-400 uppercase tracking-widest font-bold flex items-center gap-2 group cursor-help relative z-10 hover:z-50">
                                  {(t as any).spatialCompDesc || 'Composición Espacial'}
                                  <Info className="w-4 h-4 opacity-70" />
                                  <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-slate-200 text-xs p-4 rounded-xl top-[110%] w-72 z-50 pointer-events-none shadow-2xl border border-sky-500/30 left-0 whitespace-normal font-normal normal-case">
                                    {(t as any).spatialCompTooltip || 'Stratification of the coastal area into 3 severity levels.'}
                                  </div>
                               </span>
                               <div className="flex bg-slate-900 p-1 border border-slate-700 rounded-lg">
                                 <button onClick={() => setDashChartTab('histogram')} className={`px-3 py-1.5 text-[10px] rounded font-bold uppercase transition-all ${dashChartTab === 'histogram' ? 'bg-sky-600 text-white shadow-[0_0_10px_rgba(2,132,199,0.3)]' : 'text-slate-500 hover:text-slate-300'}`}>CSS</button>
                                 <button onClick={() => setDashChartTab('bar')} className={`px-3 py-1.5 text-[10px] rounded font-bold uppercase transition-all ${dashChartTab === 'bar' ? 'bg-sky-600 text-white shadow-[0_0_10px_rgba(2,132,199,0.3)]' : 'text-slate-500 hover:text-slate-300'}`}>Bar</button>
                               </div>
                            </div>

                            {dashChartTab === 'histogram' && (
                                <div className="flex flex-col gap-6 animate-in fade-in">
                                  <div className="flex items-center gap-4">
                                    <span className="text-xs font-mono w-20 text-sky-400 uppercase font-bold text-right cursor-help group relative">
                                        {t.low} (0-4)
                                        <div className="absolute bottom-[110%] md:left-0 right-0 w-64 p-3 bg-slate-800 text-[10px] text-slate-200 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-sky-500/30 font-normal normal-case whitespace-normal text-left">
                                           {(t as any).distLowTooltip || 'Aguas cristalinas o con mínima presencia de sedimentos.'}
                                        </div>
                                    </span>
                                    <div className="flex-1 h-5 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
                                      <div className="h-full bg-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.6)] rounded-full transition-all duration-1000" style={{ width: `${dashData.dist.low}%` }} />
                                    </div>
                                    <span className="text-sm font-mono text-white w-14 text-right font-bold">{dashData.dist.low.toFixed(1)}%</span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="text-xs font-mono w-20 text-emerald-400 uppercase font-bold text-right cursor-help group relative">
                                        {t.medium} (4-10)
                                        <div className="absolute bottom-[110%] md:left-0 right-0 w-64 p-3 bg-slate-800 text-[10px] text-slate-200 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-emerald-500/30 font-normal normal-case whitespace-normal text-left">
                                           {(t as any).distMedTooltip || 'Condiciones transitorias o de suspensión moderada.'}
                                        </div>
                                    </span>
                                    <div className="flex-1 h-5 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
                                      <div className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)] rounded-full transition-all duration-1000" style={{ width: `${dashData.dist.med}%` }} />
                                    </div>
                                    <span className="text-sm font-mono text-white w-14 text-right font-bold">{dashData.dist.med.toFixed(1)}%</span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="text-xs font-mono w-20 text-red-500 uppercase font-bold text-right cursor-help group relative">
                                        {t.high} (+10)
                                        <div className="absolute bottom-[110%] md:left-0 right-0 w-64 p-3 bg-slate-800 text-[10px] text-slate-200 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-red-500/30 font-normal normal-case whitespace-normal text-left">
                                           {(t as any).distHighTooltip || 'Porcentaje de mediciones con turbidez superior a 10 NTU.'}
                                        </div>
                                    </span>
                                    <div className="flex-1 h-5 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
                                      <div className="h-full bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.6)] rounded-full transition-all duration-1000" style={{ width: `${dashData.dist.high}%` }} />
                                    </div>
                                    <span className="text-sm font-mono text-white w-14 text-right font-bold">{dashData.dist.high.toFixed(1)}%</span>
                                  </div>
                                </div>
                            )}

                            {/* Removed Donut Chart per request */}

                            {dashChartTab === 'bar' && (
                               <div className="h-48 w-full animate-in fade-in zoom-in-95 duration-300">
                                   <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dashChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }} maxBarSize={40}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                                      <XAxis dataKey="labelBar" stroke="#64748b" fontSize={11} tickMargin={5} />
                                      <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => `${val}%`} />
                                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid #334155', borderRadius: '8px' }} formatter={(val) => `${val}%`} />
                                      <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                  </ResponsiveContainer>
                               </div>
                            )}
                       </div>

                    </div>

                    {/* Continuous Histogram AreaChart Section */}
                    {dashData.frequencies && dashData.frequencies.length > 0 && (
                        <div className="w-full bg-slate-950 rounded-2xl border border-slate-800 p-6 flex flex-col mt-2">
                           <span className="text-sm text-slate-400 uppercase tracking-widest font-bold mb-6 flex items-center gap-2 group cursor-help relative w-fit z-10 hover:z-50">
                              {(t as any).freqDistDesc || 'Distribución de Frecuencias'}
                              <Info className="w-4 h-4 opacity-70" />
                              <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-slate-200 text-xs p-4 rounded-xl top-[110%] w-80 z-50 pointer-events-none shadow-2xl border border-blue-500/30 left-0 whitespace-normal font-normal normal-case">
                                {(t as any).freqDistTooltip || 'Visualiza la densidad de probabilidad de los valores de NTU. Un sesgo hacia la derecha indica predominancia de aguas turbias.'}
                              </div>
                           </span>
                           <div className="w-full" style={{ minHeight: '200px' }}>
                              <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={dashData.frequencies} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                                  <XAxis dataKey="ntu" stroke="#64748b" fontSize={11} tickFormatter={(val) => `${val}`} minTickGap={30} />
                                  <YAxis 
                                    stroke="#64748b" 
                                    fontSize={11} 
                                    tickFormatter={(val) => {
                                      if (typeof val !== 'number') return val;
                                      return `${((val / frequenciesTotalCount) * 100).toFixed(1)}%`;
                                    }} 
                                  />
                                  <Tooltip 
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid #0ea5e9', borderRadius: '8px', zIndex: 1000 }} 
                                    formatter={(val: any) => {
                                      if (typeof val !== 'number') return [`${val}%`, 'Frecuencia Relativa (%)'];
                                      return [`${((val / frequenciesTotalCount) * 100).toFixed(1)}%`, 'Frecuencia Relativa (%)'];
                                    }} 
                                    labelFormatter={(val) => `NTU: ${val}`}
                                  />
                                  <Bar dataKey="count" fill="#38bdf8" radius={[2, 2, 0, 0]} maxBarSize={30} />
                                </BarChart>
                              </ResponsiveContainer>
                           </div>
                        </div>
                    )}

                  </div>
                )}
                </div>
              </div>
            </>
          )}

          {/* TAB 2: COMPARATIVE */}
          {activeTab === 'comparative' && (
            <>
             <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-slate-900 custom-scrollbar">
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 max-w-7xl mx-auto min-h-full">
                
                {/* Top Bar for Selectors */}
                <div className="bg-slate-950/50 backdrop-blur-md border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center shadow-inner shrink-0 relative z-[60]">
                   <div className="flex bg-slate-900 rounded-xl border border-slate-700/50 flex-1 w-full relative">
                       <div className="relative flex-[1] flex flex-col p-3 border-r border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                          <span className="text-[10px] text-sky-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-2"><MapIcon className="w-3 h-3" /> {(t as any).refPeriod || 'Período de Referencia'}</span>
                          <button onClick={() => { setShowCompCalendarA(!showCompCalendarA); setShowCompCalendarB(false); }} className="flex items-center justify-between w-full text-white font-mono text-sm bg-slate-950 border border-slate-800 hover:border-sky-500 rounded-lg p-3 transition-all outline-none group">
                             <span>{compDateA ? new Date(compDateA + 'T12:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : ((t as any).selectDateBtn || 'SELECCIONE FECHA')}</span>
                             <div className="w-5 h-5 rounded bg-sky-500/20 flex items-center justify-center border border-sky-500/30 group-hover:bg-sky-500/40 transition-colors">
                               <MapIcon className="w-3 h-3 text-sky-400" />
                             </div>
                          </button>
                          {showCompCalendarA && (
                              <div className="absolute top-[100%] left-0 z-[60] mt-2 bg-slate-900 border border-sky-500/50 rounded-2xl shadow-2xl p-4 w-[320px] sm:w-[350px]">
                                  <CustomCalendar dateMode="single" startDate={compDateA} endDate={compDateA} availableDates={availableDates} onSelect={(d: string) => { setCompDateA(d); setShowCompCalendarA(false); }} t={t as any} />
                              </div>
                          )}
                       </div>
                       <button 
                         onClick={() => { const temp = compDateA; setCompDateA(compDateB); setCompDateB(temp); }} 
                         className="hidden sm:flex self-center mx-2 p-3 bg-slate-800/80 hover:bg-slate-700 hover:shadow-lg border border-slate-700 hover:border-slate-500 rounded-full transition-all group z-10 cursor-pointer"
                         title={(t as any).swapDates || 'Intercambiar Fechas'}
                       >
                         <RefreshCw className="w-4 h-4 text-slate-400 group-hover:text-white group-active:-rotate-180 transition-all duration-300" />
                       </button>
                       <div className="relative flex-[1] flex flex-col p-3 hover:bg-slate-800/50 transition-colors rounded-r-xl">
                          <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-2"><MapIcon className="w-3 h-3" /> {(t as any).evalPeriod || 'Período de Evaluación'}</span>
                          <button onClick={() => { setShowCompCalendarB(!showCompCalendarB); setShowCompCalendarA(false); }} className="flex items-center justify-between w-full text-white font-mono text-sm bg-slate-950 border border-slate-800 hover:border-orange-500 rounded-lg p-3 transition-all outline-none group">
                             <span>{compDateB ? new Date(compDateB + 'T12:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : ((t as any).selectDateBtn || 'SELECCIONE FECHA')}</span>
                             <div className="w-5 h-5 rounded bg-orange-500/20 flex items-center justify-center border border-orange-500/30 group-hover:bg-orange-500/40 transition-colors">
                               <MapIcon className="w-3 h-3 text-orange-400" />
                             </div>
                          </button>
                          {showCompCalendarB && (
                              <div className="absolute top-[100%] right-0 z-[60] mt-2 bg-slate-900 border border-orange-500/50 rounded-2xl shadow-2xl p-4 w-[320px] sm:w-[350px]">
                                  <CustomCalendar dateMode="single" startDate={compDateB} endDate={compDateB} availableDates={availableDates} onSelect={(d: string) => { setCompDateB(d); setShowCompCalendarB(false); }} t={t as any} />
                              </div>
                          )}
                       </div>
                   </div>
                   <button onClick={generateComparativeReport} disabled={isGeneratingComp} className="md:w-64 w-full h-full min-h-[72px] bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(2,132,199,0.3)] flex items-center justify-center gap-2 text-sm uppercase tracking-widest border-b-[3px] border-sky-800 active:translate-y-[3px] active:border-b-0 transition-all shrink-0">
                      {isGeneratingComp ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><LayersIcon className="w-4 h-4" /> {(t as any).btnCompare || 'Comparar'}</>}
                   </button>
                </div>

                <div className="flex-1 flex flex-col gap-6 relative overflow-hidden">
                   {!compData ? (
                       <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 mt-12 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-12">
                        <LayersIcon className="w-20 h-20 opacity-20" />
                        <span className="text-sm font-bold uppercase tracking-widest text-center">{(t as any).selectTwoDates || 'Seleccione dos fechas para comparar el Delta Estadístico'}</span>
                      </div>
                   ) : compData.empty ? (
                       <div className="flex flex-col items-center justify-center h-full text-red-400 gap-4 mt-12 bg-slate-900/50 border border-red-500/20 rounded-2xl p-12">
                        <Info className="w-16 h-16 opacity-50" />
                        <span className="text-sm font-bold uppercase tracking-widest text-center">{(t as any).invalidDates || 'Fechas inválidas o sin datos para una de ellas.'}</span>
                      </div>
                   ) : (
                      <div className="flex flex-col gap-6 animate-in zoom-in-95 data-delta w-full">
                         
                         {/* Conclusions & Delta Panel */}
                         <div className={`p-6 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl relative z-20 ${compData.deltaPercent > 0 ? 'bg-red-950/30 border-red-500/30 shadow-[0_4px_30px_rgba(239,68,68,0.1)]' : 'bg-emerald-950/30 border-emerald-500/30 shadow-[0_4px_30px_rgba(16,185,129,0.1)]'}`}>
                            <div className="flex flex-col gap-2 max-w-2xl">
                               <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 group relative cursor-help w-max ${compData.deltaPercent > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                  <Activity className="w-3 h-3" /> {(t as any).compResultsTitle || 'Resultados del Contraste'} <Info className="w-3 h-3 opacity-70" />
                                  <div className="absolute top-[110%] left-0 w-64 text-[10px] bg-slate-800 text-slate-200 p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-slate-600 font-normal normal-case">
                                    {(t as any).compResultsTooltip || 'Conclusión automatizada generada por el motor de inferencia basándose en los deltas estadísticos.'}
                                  </div>
                               </span>
                               <p className="text-slate-300 text-sm md:text-base leading-relaxed">
                                  {compData.deltaPercent > 30 
                                    ? ((t as any).detSevere || "Se observa un aumento significativo de la turbidez respecto a la fecha de referencia.")
                                    : compData.deltaPercent > 5
                                    ? ((t as any).detMod || "Se observa un aumento moderado de la turbidez.")
                                    : compData.deltaPercent < -30
                                    ? ((t as any).impSevere || "Se observa una disminución significativa de la turbidez respecto a la fecha de referencia.")
                                    : compData.deltaPercent < -5
                                    ? ((t as any).impMod || "Se observa una disminución moderada de la turbidez respecto a la fecha de referencia.")
                                    : ((t as any).stable || "Las variaciones de turbidez observadas entre ambas fechas son mínimas.")}
                               </p>
                            </div>
                            <div className="flex flex-col md:items-end shrink-0 bg-slate-950/50 p-4 rounded-xl border border-slate-800 text-center md:text-right w-full md:w-auto">
                               <span className={`text-4xl md:text-5xl font-mono font-bold tracking-tighter ${compData.deltaPercent > 0 ? 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.4)]'}`}>
                                  {compData.deltaPercent > 0 ? '+' : ''}{compData.deltaPercent.toFixed(1)}%
                               </span>
                               <span className="text-slate-400 text-[10px] uppercase tracking-widest mt-1 flex items-center justify-center md:justify-end gap-1 group relative cursor-help">
                                  {(t as any).deltaMeanTitle || 'Variación (Delta Media)'}
                                  <Info className="w-3 h-3 opacity-70" />
                                  <div className="absolute bottom-[110%] md:right-0 w-48 text-[10px] bg-slate-800 text-slate-200 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-slate-600 font-normal normal-case">
                                    {(t as any).deltaMeanTooltip || 'Diferencia porcentual del nivel promedio de turbidez entre ambas fechas.'}
                                  </div>
                               </span>
                            </div>
                         </div>

                         {/* Side by Side */}
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
                            
                            {/* Día A */}
                            <div className="bg-slate-950 rounded-2xl border border-sky-500/20 flex flex-col shadow-inner relative z-10 transition-all hover:z-50">
                               <div className="p-4 border-b border-sky-500/20 bg-sky-950/20 flex justify-between items-center rounded-t-2xl">
                                  <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest flex items-center gap-2 group relative cursor-help">
                                    <LayersIcon className="w-3 h-3"/> {(t as any).histRefTitle || 'Referencia Histórica'} <Info className="w-3 h-3 opacity-70"/>
                                    <div className="absolute bottom-[110%] left-0 w-56 text-[10px] bg-slate-800 text-slate-200 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-sky-500/30 font-normal normal-case">
                                      {(t as any).histRefTooltip || 'Datos del estado base de la bahía. Servirá como punto de partida (T0).'}
                                    </div>
                                  </span>
                                  <span className="bg-sky-500/10 text-sky-400 px-3 py-1 rounded-full text-[10px] font-mono tracking-widest border border-sky-500/20">{compDateA ? new Date(compDateA + 'T12:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'N/A'}</span>
                               </div>
                               <div className="h-48 w-full overflow-hidden relative border-b border-slate-800 bg-slate-950 flex items-center justify-center">
                                  <StaticMapThumbnail date={compDateA} satellite={satellite} algorithm={algorithm} />
                               </div>
                               <div className="p-4 flex gap-3 bg-slate-900/40 rounded-b-2xl">
                                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 text-center pointer-events-auto relative group z-10 hover:z-50">
                                     <span className="text-[9px] text-slate-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1 cursor-help truncate">Media NTU <Info className="w-3 h-3 opacity-70 shrink-0"/></span>
                                     <span className="text-xl font-mono text-white font-bold">{compData.dayA.mean.toFixed(2)}</span>
                                     <div className="absolute top-[110%] left-1/2 -translate-x-1/2 w-48 bg-slate-800 text-xs text-slate-300 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-xl border border-sky-500/30 font-normal normal-case">
                                       {(t as any).avgNtuDesc || 'Concentración media de material particulado base.'}
                                     </div>
                                  </div>
                                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 text-center pointer-events-auto relative group z-10 hover:z-50">
                                     <span className="text-[9px] text-slate-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1 cursor-help truncate">Máx NTU <Info className="w-3 h-3 opacity-70 shrink-0"/></span>
                                     <span className="text-xl font-mono text-emerald-400 font-bold">{compData.dayA.max.toFixed(2)}</span>
                                     <div className="absolute top-[110%] left-1/2 -translate-x-1/2 w-48 bg-slate-800 text-xs text-slate-300 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-xl border border-sky-500/30 font-normal normal-case">
                                        {(t as any).maxNtuDesc || 'Pico máximo de concentración.'}
                                     </div>
                                  </div>
                                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 text-center pointer-events-auto relative group z-10 hover:z-50">
                                     <span className="text-[9px] text-slate-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1 cursor-help truncate">{(t as any).criticalArea || 'Área Crítica'} <Info className="w-3 h-3 opacity-70 shrink-0"/></span>
                                     <span className="text-xl font-mono text-red-400 font-bold">{compData.dayA.dist.high.toFixed(1)}%</span>
                                     <div className="absolute top-[110%] right-0 md:left-1/2 md:-translate-x-1/2 w-48 bg-slate-800 text-xs text-slate-300 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-xl border border-sky-500/30 font-normal normal-case">
                                       {(t as any).criticalAreaTooltip || 'Porcentaje de la superficie con turbidez superior a 10 NTU.'}
                                     </div>
                                  </div>
                               </div>
                            </div>

                            {/* Día B */}
                            <div className="bg-slate-950 rounded-2xl border border-orange-500/20 flex flex-col shadow-inner relative z-10 transition-all hover:z-50">
                               <div className="p-4 border-b border-orange-500/20 bg-orange-950/20 flex justify-between items-center rounded-t-2xl">
                                  <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2 group relative cursor-help">
                                    <Activity className="w-3 h-3"/> {(t as any).evalStateTitle || 'Estado de Evaluación'} <Info className="w-3 h-3 opacity-70"/>
                                    <div className="absolute bottom-[110%] left-0 w-56 text-[10px] bg-slate-800 text-slate-200 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-orange-500/30 font-normal normal-case">
                                      {(t as any).evalStateTooltip || 'Datos del estado a comparar (T1). Sus métricas se contrastarán contra la Referencia.'}
                                    </div>
                                  </span>
                                  <span className="bg-orange-500/10 text-orange-400 px-3 py-1 rounded-full text-[10px] font-mono tracking-widest border border-orange-500/20">{compDateB ? new Date(compDateB + 'T12:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'N/A'}</span>
                               </div>
                               <div className="h-48 w-full overflow-hidden relative border-b border-slate-800 bg-slate-950 flex items-center justify-center">
                                   <StaticMapThumbnail date={compDateB} satellite={satellite} algorithm={algorithm} />
                               </div>
                               <div className="p-4 flex gap-3 bg-slate-900/40 rounded-b-2xl">
                                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 text-center pointer-events-auto relative group z-10 hover:z-50">
                                     <span className="text-[9px] text-slate-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1 cursor-help truncate">Media NTU <Info className="w-3 h-3 opacity-70 shrink-0"/></span>
                                     <span className="text-xl font-mono text-white font-bold">{compData.dayB.mean.toFixed(2)}</span>
                                     <div className="absolute top-[110%] left-1/2 -translate-x-1/2 w-48 bg-slate-800 text-xs text-slate-300 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-xl border border-orange-500/30 font-normal normal-case">
                                        {(t as any).avgNtuDesc || 'Concentración media de material particulado contraste.'}
                                     </div>
                                  </div>
                                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 text-center pointer-events-auto relative group z-10 hover:z-50">
                                     <span className="text-[9px] text-slate-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1 cursor-help truncate">Máx NTU <Info className="w-3 h-3 opacity-70 shrink-0"/></span>
                                     <span className="text-xl font-mono text-emerald-400 font-bold">{compData.dayB.max.toFixed(2)}</span>
                                     <div className="absolute top-[110%] left-1/2 -translate-x-1/2 w-48 bg-slate-800 text-xs text-slate-300 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-xl border border-orange-500/30 font-normal normal-case">
                                        {(t as any).maxNtuDesc || 'Pico máximo de concentración.'}
                                     </div>
                                  </div>
                                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 text-center pointer-events-auto relative group z-10 hover:z-50">
                                     <span className="text-[9px] text-slate-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1 cursor-help truncate">{(t as any).criticalArea || 'Área Crítica'} <Info className="w-3 h-3 opacity-70 shrink-0"/></span>
                                     <span className="text-xl font-mono text-red-400 font-bold">{compData.dayB.dist.high.toFixed(1)}%</span>
                                     <div className="absolute top-[110%] right-0 md:left-1/2 md:-translate-x-1/2 w-48 bg-slate-800 text-xs text-slate-300 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-xl border border-orange-500/30 font-normal normal-case">
                                       {(t as any).criticalAreaTooltip || 'Porcentaje de la superficie con turbidez superior a 10 NTU.'}
                                     </div>
                                  </div>
                               </div>
                            </div>

                         </div>

                         {/* Enrichment Charts */}
                         <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6 shadow-inner z-0 relative">
                            <span className="text-sm font-bold uppercase tracking-widest text-slate-300 mb-6 flex items-center gap-2 group relative cursor-help w-max">
                              {(t as any).directCompTitle || 'Análisis Comparativo Directo'} <Info className="w-4 h-4 opacity-70" />
                              <div className="absolute bottom-[110%] left-0 w-72 text-[10px] bg-slate-800 text-slate-200 p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-slate-600 font-normal normal-case">
                                {(t as any).directCompTooltip || 'Gráfico de barras agrupadas que plasma lado a lado las 3 métricas de severidad.'}
                              </div>
                            </span>
                            <div className="w-full h-80">
                               <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={[
                                    { metric: 'Media NTU', Referencia: Number(compData.dayA.mean.toFixed(2)), Evaluación: Number(compData.dayB.mean.toFixed(2)) },
                                    { metric: 'Máx NTU', Referencia: Number(compData.dayA.max.toFixed(2)), Evaluación: Number(compData.dayB.max.toFixed(2)) },
                                    { metric: 'Turbidez Alta %', Referencia: Number(compData.dayA.dist.high.toFixed(1)), Evaluación: Number(compData.dayB.dist.high.toFixed(1)) }
                                  ]} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                                    <XAxis dataKey="metric" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 'bold' }} />
                                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(14, 165, 233, 0.3)', borderRadius: '12px', fontSize: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                                        itemStyle={{ fontWeight: 'bold' }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 'bold' }} />
                                    <Bar dataKey="Referencia" name={`Referencia (${compDateA ? new Date(compDateA + 'T12:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).toUpperCase() : ''})`} fill="#0ea5e9" radius={[4, 4, 0, 0]} barSize={40} />
                                    <Bar dataKey="Evaluación" name={`Evaluación (${compDateB ? new Date(compDateB + 'T12:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).toUpperCase() : ''})`} fill="#f97316" radius={[4, 4, 0, 0]} barSize={40} />
                                  </BarChart>
                               </ResponsiveContainer>
                            </div>
                         </div>
                      </div>
                   )}
                </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 3: EXPORT */}
          {activeTab === 'export' && (
            <>
             <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-slate-900 custom-scrollbar">
                <div className="flex flex-col md:flex-row gap-8 animate-in fade-in slide-in-from-bottom-4 max-w-7xl mx-auto min-h-full">
                <div className="md:w-1/2 flex flex-col gap-8">
                   <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-inner flex flex-col flex-1">
                      <h3 className="text-lg font-bold text-slate-300 uppercase tracking-widest mb-8 flex items-center gap-3">
                        <Download className="w-6 h-6 text-emerald-400" /> {(t as any).structuredData || 'Datos Históricos Estructurados'}
                      </h3>

                      <div className="space-y-6 flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2 w-max group relative cursor-help">
                              {t.exportMode} <Info className="w-3 h-3 opacity-70" />
                              <div className="absolute bottom-[110%] left-0 w-64 text-[10px] bg-slate-800 text-slate-200 p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-emerald-500/30 font-normal normal-case">
                                {(t as any).exportModeTooltip || 'Selecciona la amplitud del rango temporal a extraer.'}
                              </div>
                            </label>
                          <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-lg shadow-inner">
                            {(['all', 'range', 'single'] as const).map(mode => (
                              <button key={mode} onClick={() => setExportModeSelection(mode)} className={`flex-1 text-xs py-2 rounded-md font-bold uppercase transition-all ${exportModeSelection === mode ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                                {mode === 'all' ? t.allHistory : mode === 'range' ? t.rangeDateMode : t.singleDateModeExport}
                              </button>
                            ))}
                          </div>
                        </div>

                        {exportModeSelection !== 'all' && (
                           <div className="relative">
                              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">PERÍODO SELECCIONADO</label>
                              <button onClick={() => setShowExportCalendar(!showExportCalendar)} className="flex items-center justify-between w-full text-white font-mono text-sm bg-slate-950 border border-slate-800 hover:border-emerald-500 rounded-lg p-3 transition-all outline-none group">
                                 <span>
                                    {exportModeSelection === 'single' 
                                      ? (exportStartDate ? new Date(exportStartDate + 'T12:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'SELECCIONE FECHA')
                                      : (exportStartDate && exportEndDate ? `${new Date(exportStartDate + 'T12:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).toUpperCase()} - ${new Date(exportEndDate + 'T12:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}` : 'SELECCIONE RANGO')
                                    }
                                 </span>
                                 <div className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 group-hover:bg-emerald-500/40 transition-colors">
                                   <MapIcon className="w-3 h-3 text-emerald-400" />
                                 </div>
                              </button>
                              {showExportCalendar && (
                                  <div className="absolute top-[100%] left-0 z-[60] mt-2 bg-slate-900 border border-emerald-500/50 rounded-2xl shadow-2xl p-4 w-[320px] sm:w-[350px]">
                                      <CustomCalendar
                                        dateMode={exportModeSelection === 'single' ? 'single' : 'range'}
                                        startDate={exportStartDate}
                                        endDate={exportEndDate}
                                        availableDates={exportAvailableDates}
                                        onSelect={(start: string, end: string) => { setExportStartDate(start); setExportEndDate(end); if(exportModeSelection==='single' || start && end) setShowExportCalendar(false); }}
                                        t={t as any}
                                      />
                                  </div>
                              )}
                           </div>
                        )}

                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2 w-max group relative cursor-help">
                              {t.formatLabel} <Info className="w-3 h-3 opacity-70" />
                              <div className="absolute bottom-[110%] left-0 w-64 text-[10px] bg-slate-800 text-slate-200 p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-emerald-500/30 font-normal normal-case">
                                {(t as any).exportFormatTooltip || 'Elige el estándar de serialización de datos adecuado.'}
                              </div>
                            </label>
                          <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-lg shadow-inner">
                            {['csv', 'json', 'txt', 'xlsx'].map(fmt => (
                              <button key={fmt} onClick={() => setReportFormat(fmt)} className={`flex-1 text-xs py-2 rounded-md font-bold uppercase transition-all ${reportFormat === fmt ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                                {fmt.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2 w-max group relative cursor-help">
                              Satélite <Info className="w-3 h-3 opacity-70" />
                              <div className="absolute bottom-[110%] left-0 w-64 text-[10px] bg-slate-800 text-slate-200 p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-emerald-500/30 font-normal normal-case">
                                {(t as any).exportSatTooltip || 'Selecciona la constelación satelital para la extracción.'}
                              </div>
                            </label>
                          <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-lg shadow-inner">
                            {['S2', 'S3'].map(sat => (
                              <button key={sat} onClick={() => { setExportSatellite(sat as 'S2' | 'S3'); setExportAlgorithm(sat === 'S2' ? 'Nechad2009' : 'SVR'); }} className={`flex-1 text-xs py-2 rounded-md font-bold uppercase transition-all ${exportSatellite === sat ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                                {sat === 'S2' ? 'Sentinel-2' : 'Sentinel-3'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2 w-max group relative cursor-help">
                              Algoritmo <Info className="w-3 h-3 opacity-70" />
                              <div className="absolute bottom-[110%] left-0 w-64 text-[10px] bg-slate-800 text-slate-200 p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-emerald-500/30 font-normal normal-case">
                                {(t as any).exportAlgTooltip || 'Selecciona el modelo de inferencia de turbidez.'}
                              </div>
                            </label>
                          <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-lg shadow-inner">
                            {(exportSatellite === 'S2' ? ['Nechad2009', 'Dogliotti2015', 'Eljaiek'] : ['SVR']).map(alg => (
                              <button key={alg} onClick={() => setExportAlgorithm(alg)} className={`flex-1 text-xs py-2 rounded-md font-bold uppercase transition-all ${exportAlgorithm === alg ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                                {alg}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <button onClick={handleDownloadHistoricalReport} disabled={isDownloadingReport} className="w-full max-w-md mx-auto mt-8 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-3 tracking-widest text-sm border-b-[3px] border-emerald-800 active:border-b-0 active:translate-y-1">
                        {isDownloadingReport ? <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div> : <><Download className="w-6 h-6" /> {((t as any).downloadDataset || 'DESCARGAR DATASET')}</>}
                      </button>
                   </div>
                </div>

                <div className="md:w-1/2 flex flex-col gap-8">
                   <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-inner flex flex-col justify-center">
                      <h3 className="text-lg font-bold text-white uppercase tracking-widest mb-3 flex items-center gap-3 group relative w-fit cursor-help z-[100]">
                        <MapIcon className="w-6 h-6 text-sky-400" /> {(t as any).staticMapHd || 'Mapa Estático (PNG HD)'}
                        <div className="absolute top-[110%] left-0 w-72 text-[10px] bg-slate-800 text-slate-200 p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none shadow-2xl border border-sky-500/30 font-normal normal-case">
                           {(t as any).staticMapHdDesc || 'Capta un Frame de Alta Definición del Canva renderizado actualmente de la Bahía.'}
                        </div>
                      </h3>
                      <p className="text-sm text-slate-500 mb-8 leading-relaxed">{(t as any).staticMapHdDesc || 'Capta un Frame de Alta Definición del Canva renderizado actualmente de la Bahía.'}</p>
                      
                      <button onClick={handleDownloadMapImage} className="w-full bg-slate-800 hover:bg-slate-700 hover:border-slate-500 text-sky-400 font-bold py-5 rounded-2xl border-2 border-slate-600 transition-all flex items-center justify-center gap-3 text-sm tracking-widest">
                         <MapIcon className="w-6 h-6" /> {((t as any).generateSnapshot || 'GENERAR SNAPSHOT')}
                      </button>
                   </div>

                   <div className="bg-slate-900 p-8 rounded-2xl border md:border-dashed border-purple-500/30 shadow-[0_0_50px_rgba(147,51,234,0.08)] bg-linear-to-br from-slate-900 to-purple-950/20 flex-1 flex flex-col justify-center gap-6">
                      <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                        <Video className="w-6 h-6 text-purple-400" /> {(t as any).temporalAnimation || 'Animación Temporal WebM'}
                      </h3>
                      <p className="text-sm text-slate-400 leading-relaxed max-w-md">{t.videoDesc}</p>
                      <button onClick={handleRecordVideo} disabled={isRecordingVideo} className="relative w-full overflow-hidden mt-6 group bg-slate-950 hover:bg-slate-900 border border-slate-700 hover:border-purple-500 text-white font-bold py-6 rounded-2xl transition-all flex items-center justify-center gap-4 tracking-widest text-base group z-10 hover:z-50">
                         {isRecordingVideo ? (
                           <><div className="w-4 h-4 bg-red-500 rounded-full animate-ping" /> {t.recordingVideo}</>
                         ) : (
                           <><Video className="w-6 h-6 text-purple-400 group-hover:scale-110 transition-transform" /> {((t as any).startSpatialRecording || 'INICIAR GRABACIÓN ESPACIAL')}</>
                         )}
                         <div className="absolute inset-0 bg-linear-to-r from-purple-600/0 via-purple-600/10 to-purple-600/0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                      </button>
                   </div>
                </div>
               </div>
             </div>
            </>
           )}

        </div>
      </div>
    </div>
  );
};

export default ReportsModal;