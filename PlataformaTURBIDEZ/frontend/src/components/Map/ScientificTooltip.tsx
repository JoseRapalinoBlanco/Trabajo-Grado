import { useEffect, useState, useMemo } from 'react';
import { X, Activity, Target, Waves, Maximize2, Minimize2, TrendingUp, ExternalLink } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

interface ScientificTooltipProps {
  clickedPoint: { lat: number; lon: number };
  exactNtu?: number;
  clickDate: string;
  currentDate: string;
  startDate: string;
  endDate: string;
  onExpandRange: () => void;
  onClose: () => void;
  t: any;
}

interface TimeSeriesPoint {
  date: string;
  ntu: number;
}

const ScientificTooltip = ({
  clickedPoint,
  exactNtu,
  clickDate,
  currentDate,
  startDate,
  endDate,
  onExpandRange,
  onClose,
  t
}: ScientificTooltipProps) => {
  const [rawData, setRawData] = useState<TimeSeriesPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/v1/turbidity/timeseries/point?lat=${clickedPoint.lat}&lon=${clickedPoint.lon}&start_date=${startDate}&end_date=${endDate}`
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        
        if (!isCancelled) setRawData(json);
      } catch (err) {
        console.error(err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };
    fetchData();
    return () => { isCancelled = true; };
  }, [clickedPoint.lat, clickedPoint.lon, startDate, endDate]);

  const data = useMemo(() => {
    let processedData = rawData;
    if (exactNtu !== undefined && exactNtu !== null) {
        processedData = processedData.map((item: TimeSeriesPoint) => 
            item.date === clickDate ? { ...item, ntu: exactNtu } : item
        );
    }
    return processedData;
  }, [rawData, clickDate, exactNtu]);

  const stats = useMemo(() => {
    if (data.length === 0) return { mean: 0, max: 0, min: 0, std: 0 };
    const values = data.map((d: TimeSeriesPoint) => d.ntu);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((a: number, b: number) => a + Math.pow(b - mean, 2), 0) / values.length);
    return { mean, max, min, std };
  }, [data]);

  const currentNtu = useMemo(() => {
    if (exactNtu !== undefined && exactNtu !== null && currentDate === clickDate) return exactNtu;
    const pt = data.find((d: TimeSeriesPoint) => d.date === currentDate);
    return pt ? pt.ntu : null;
  }, [data, currentDate, clickDate, exactNtu]);

  const getNtuColor = (ntu: number) => {
    if (ntu < 5) return '#0ea5e9'; // clear/blue
    if (ntu < 10) return '#10b981'; // low/green
    if (ntu < 15) return '#84cc16'; // moderate/lime
    if (ntu < 20) return '#eab308'; // medium/yellow
    if (ntu < 25) return '#f97316'; // high/orange
    if (ntu < 30) return '#ef4444'; // critical/red
    return '#991b1b'; // extreme/dark-red
  };

  return (
    <div className="fixed inset-x-4 top-24 md:top-5 md:inset-x-auto md:left-[340px] md:right-auto z-50 bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] md:w-[360px] flex flex-col gap-5 animate-in fade-in slide-in-from-left-4 duration-300">
      
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="relative flex h-3 w-3 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </div>
            <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] drop-shadow-md">
              {t.analysisPoint || 'Punto de Análisis'}
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 font-mono tracking-tight flex items-center gap-1.5">
            <Target className="w-3 h-3 text-slate-500" />
            {clickedPoint.lat.toFixed(5)}°, {clickedPoint.lon.toFixed(5)}°
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 bg-slate-800/50 hover:bg-red-500/20 rounded-full text-slate-400 hover:text-red-400 transition-all border border-transparent hover:border-red-500/20">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Current Value Display (Hero Metric) */}
      <div className="bg-linear-to-br from-slate-800/80 to-slate-900/90 rounded-2xl p-4 border border-cyan-500/20 flex flex-col relative overflow-hidden group">
        <div className="absolute -right-4 -top-4 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all duration-500"></div>
        <span className="text-[10px] text-cyan-400/80 font-black uppercase tracking-widest mb-1 z-10 flex justify-between items-center">
          {t.currentNtu || 'NTU Actual'}
          <span className="text-slate-500 text-[9px] px-2 py-0.5 bg-slate-950/50 rounded-full border border-slate-700/50">{currentDate}</span>
        </span>
        <div className="flex items-baseline gap-2 z-10 mt-1">
          {isLoading ? (
            <span className="text-4xl font-black text-slate-600 animate-pulse tracking-tighter">--.--</span>
          ) : currentNtu !== null ? (
            <span className="text-4xl font-black text-white font-mono tracking-tighter drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">
              {currentNtu.toFixed(2)}
            </span>
          ) : (
            <span className="text-3xl font-black text-slate-500 tracking-tighter">{t.noDataChart || 'N/D'}</span>
          )}
          <span className="text-sm font-bold text-slate-500">NTU</span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-32 w-full relative">
        {isLoading ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-slate-950/30 rounded-xl border border-white/5">
            <Activity className="w-6 h-6 text-cyan-500/50 animate-pulse" />
            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold animate-pulse">Analizando serie temporal...</span>
          </div>
        ) : data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={[0, stats.max > 30 ? 'dataMax + 2' : 30]} />
              <Tooltip 
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(34, 211, 238, 0.3)', borderRadius: '12px', fontSize: '11px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                itemStyle={{ color: '#f8fafc', fontWeight: '900', fontFamily: 'monospace' }}
                labelStyle={{ color: '#94a3b8', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', marginBottom: '4px' }}
                formatter={(val: any) => val === null ? ['Sin Datos', 'NTU'] : [(val as number).toFixed(2), 'NTU']}
              />
              <Bar dataKey="ntu" radius={[2, 2, 0, 0]} maxBarSize={16} animationDuration={1000}>
                {data.map((entry: any, index: number) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={getNtuColor(entry.ntu)} 
                    fillOpacity={entry.date === currentDate ? 1 : 0.6} 
                    stroke={entry.date === currentDate ? '#ffffff' : 'transparent'}
                    strokeWidth={entry.date === currentDate ? 1 : 0}
                  />
                ))}
              </Bar>
              {currentDate && (
                <ReferenceLine x={currentDate} stroke="#f8fafc" strokeDasharray="3 3" opacity={0.5} />
              )}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-950/30 rounded-xl border border-dashed border-slate-700">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{t.noDataChart || 'Sin Datos'}</span>
          </div>
        )}
      </div>

      {/* Stats Panel */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-slate-950/40 rounded-xl p-2.5 border border-white/5 flex flex-col justify-center hover:bg-slate-800/50 transition-colors">
          <div className="flex items-center gap-1.5 mb-1 text-slate-400">
            <Waves className="w-3 h-3 text-emerald-400" />
            <span className="text-[9px] font-bold uppercase tracking-widest leading-none">{t.average || 'Promedio'}</span>
          </div>
          <span className="text-[12px] font-mono font-black text-slate-200">{stats.mean.toFixed(2)} <span className="text-[9px] text-slate-500">NTU</span></span>
        </div>
        <div className="bg-slate-950/40 rounded-xl p-2.5 border border-white/5 flex flex-col justify-center hover:bg-slate-800/50 transition-colors">
          <div className="flex items-center gap-1.5 mb-1 text-slate-400">
            <TrendingUp className="w-3 h-3 text-amber-400" />
            <span className="text-[9px] font-bold uppercase tracking-widest leading-none">{(t as any).stdDev || 'Desv. Est.'}</span>
          </div>
          <span className="text-[12px] font-mono font-black text-slate-200">±{stats.std.toFixed(2)}</span>
        </div>
        <div className="bg-slate-950/40 rounded-xl p-2.5 border border-white/5 flex flex-col justify-center hover:bg-slate-800/50 transition-colors">
          <div className="flex items-center gap-1.5 mb-1 text-slate-400">
            <Maximize2 className="w-3 h-3 text-rose-400" />
            <span className="text-[9px] font-bold uppercase tracking-widest leading-none">{t.maximum || 'Máximo'}</span>
          </div>
          <span className="text-[12px] font-mono font-black text-slate-200">{stats.max.toFixed(2)} <span className="text-[9px] text-slate-500">NTU</span></span>
        </div>
        <div className="bg-slate-950/40 rounded-xl p-2.5 border border-white/5 flex flex-col justify-center hover:bg-slate-800/50 transition-colors">
          <div className="flex items-center gap-1.5 mb-1 text-slate-400">
            <Minimize2 className="w-3 h-3 text-sky-400" />
            <span className="text-[9px] font-bold uppercase tracking-widest leading-none">{t.minimum || 'Mínimo'}</span>
          </div>
          <span className="text-[12px] font-mono font-black text-slate-200">{stats.min.toFixed(2)} <span className="text-[9px] text-slate-500">NTU</span></span>
        </div>
      </div>

      {/* Expand Range Action - Tooltip level */}
      <button 
        onClick={onExpandRange}
        className="w-full py-2.5 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-900 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 group shadow-[0_5px_15px_rgba(0,0,0,0.3)] hover:shadow-[0_5px_20px_rgba(34,211,238,0.15)]"
      >
        <ExternalLink className="w-3.5 h-3.5 group-hover:drop-shadow-[0_0_5px_rgba(34,211,238,0.8)] transition-all" />
        {t.expandRange || 'Ampliar Rango (±1 Mes)'}
      </button>

    </div>
  );
};

export default ScientificTooltip;
