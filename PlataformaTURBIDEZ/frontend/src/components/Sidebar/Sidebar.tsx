import { Droplets, Globe, User, Activity, ChevronRight, BarChart3, X, Satellite } from 'lucide-react';
import type { TranslationSet } from '../../i18n/translations';

interface SidebarProps {
  t: TranslationSet;
  lang: string;
  isOpen: boolean;
  selectedSatellite: 'S2' | 'S3';
  selectedAlgorithm: string;
  onClose: () => void;
  onToggleLang: () => void;
  onLoginClick: () => void;
  onOpenReports: () => void;
  onSatelliteChange: (sat: 'S2' | 'S3') => void;
  onAlgorithmChange: (algo: string) => void;
}

const S2_ALGORITHMS = [
  { value: 'Nechad2009', label: 'Nechad 2009 (665nm)' },
  { value: 'Dogliotti2015', label: 'Dogliotti 2015' },
  { value: 'Eljaiek', label: 'Eljaiek' },
];

const S3_ALGORITHMS = [
  { value: 'SVR', label: 'Support Vector Regression (SVR)' },
];

const Sidebar = ({
  t, lang, isOpen, selectedSatellite, selectedAlgorithm,
  onClose, onToggleLang, onLoginClick, onOpenReports,
  onSatelliteChange, onAlgorithmChange,
}: SidebarProps) => {

  const algorithms = selectedSatellite === 'S2' ? S2_ALGORITHMS : S3_ALGORITHMS;

  return (
    <div
      className={`
        w-80 bg-slate-900/95 backdrop-blur-xl border-r border-slate-700/50
        flex flex-col shadow-2xl pointer-events-auto z-30 shrink-0 h-full
        transition-all duration-300 ease-in-out overflow-hidden
        ${isOpen ? 'max-w-80 opacity-100' : 'max-w-0 opacity-0 border-r-0'}
        max-md:absolute max-md:left-0 max-md:top-0 max-md:bottom-0
        ${isOpen ? '' : 'max-md:-translate-x-full'}
      `}
    >
      <div className="w-80 flex flex-col h-full">

        {/* Header Section */}
        <div className="p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 shrink-0">
              <Droplets className="w-7 h-7 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-white">{t.appTitle}</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                {t.appSubtitle}
              </p>
            </div>
            {/* Close button - mobile only */}
            <button
              onClick={onClose}
              className="md:hidden p-1.5 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onToggleLang}
              className="flex-1 p-2 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg transition-colors text-slate-300 hover:text-white border border-slate-700/50 flex items-center justify-center gap-2 font-bold text-xs"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang.toUpperCase()}</span>
            </button>
            <button
              onClick={onLoginClick}
              className="flex-1 p-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg transition-colors border border-emerald-500/30 flex items-center justify-center gap-2 font-bold text-xs"
            >
              <User className="w-3.5 h-3.5" />
              <span>{t.login}</span>
            </button>
          </div>
        </div>

        {/* Control Panel Content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 custom-scrollbar">

          {/* Analysis Module Section */}
          <div className="space-y-3">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" /> {t.analysisModule}
            </h2>

            {/* Satellite Source Selector */}
            <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50 shadow-inner">
              <label className="text-[10px] font-semibold text-slate-400 mb-2 block uppercase tracking-wider flex items-center gap-1.5">
                <Satellite className="w-3 h-3" />
                {t.satelliteSource}
              </label>
              {/* Toggle Switch Pills */}
              <div className="flex gap-1 p-1 bg-slate-900/80 rounded-lg border border-slate-700/30">
                <button
                  onClick={() => onSatelliteChange('S2')}
                  className={`flex-1 py-2 px-3 rounded-md text-xs font-bold transition-all duration-200 ${
                    selectedSatellite === 'S2'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm shadow-sky-500/10'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent'
                  }`}
                >
                  Sentinel-2
                </button>
                <button
                  onClick={() => onSatelliteChange('S3')}
                  className={`flex-1 py-2 px-3 rounded-md text-xs font-bold transition-all duration-200 ${
                    selectedSatellite === 'S3'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent'
                  }`}
                >
                  Sentinel-3
                </button>
              </div>
            </div>

            {/* Algorithm Selector */}
            <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50 shadow-inner">
              <label className="text-[10px] font-semibold text-slate-400 mb-2 block uppercase tracking-wider">{t.ingestedAlgo}</label>
              <div className="relative">
                <select
                  className={`w-full bg-slate-900 border border-slate-600/50 rounded-lg p-2.5 text-xs font-medium tracking-wide focus:outline-none appearance-none cursor-pointer transition-colors ${
                    selectedSatellite === 'S2'
                      ? 'text-sky-400 focus:border-sky-500/50'
                      : 'text-emerald-400 focus:border-emerald-500/50'
                  }`}
                  value={selectedAlgorithm}
                  onChange={(e) => onAlgorithmChange(e.target.value)}
                >
                  {algorithms.map(algo => (
                    <option key={algo.value} value={algo.value}>{algo.label}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                  <ChevronRight className={`w-3.5 h-3.5 opacity-70 ${
                    selectedSatellite === 'S2' ? 'text-sky-500' : 'text-emerald-500'
                  }`} />
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-2.5 leading-relaxed">
                {t.algoDesc}
              </p>
            </div>
          </div>

          <div className="h-px w-full bg-slate-800/60" />

          {/* Reports & Statistics Button */}
          <button
            onClick={onOpenReports}
            className="w-full bg-slate-800/20 hover:bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/50 transition-all group flex justify-between items-center shadow-lg hover:border-purple-500/30"
          >
            <div className="flex items-center gap-2.5">
              <div className="bg-purple-500/10 p-2 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                <BarChart3 className="w-4 h-4 text-purple-400 group-hover:text-purple-300" />
              </div>
              <h2 className="text-[10px] font-bold text-slate-300 group-hover:text-white uppercase tracking-wider">
                {t.reportsModule}
              </h2>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition-colors" />
          </button>

        </div>

        {/* Footer Section */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900 mt-auto text-center">
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1">
            {t.footerProject}
          </p>
          <p className="text-[10px] text-slate-400 font-bold">
            {t.footerUni}
          </p>
        </div>

      </div>
    </div>
  );
};

export default Sidebar;
