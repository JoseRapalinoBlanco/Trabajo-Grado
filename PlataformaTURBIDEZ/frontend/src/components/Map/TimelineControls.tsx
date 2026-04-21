import { Play, Pause, CalendarDays, ExternalLink } from 'lucide-react';
import type { TranslationSet } from '../../i18n/translations';
import CustomCalendar from './CustomCalendar';

interface TimelineControlsProps {
  t: TranslationSet;
  showCalendar: boolean;
  showTimeline: boolean;
  dateMode: 'single' | 'range';
  startDate: string;
  endDate: string;
  currentDate: string;
  sliderValue: number;
  isPlaying: boolean;
  availableDates: string[];
  maxSliderValue?: number;
  onToggleCalendar: () => void;
  onSetDateMode: (mode: 'single' | 'range') => void;
  onSetStartDate: (date: string) => void;
  onSetEndDate: (date: string) => void;
  onAcceptCalendar: () => void;
  onSliderChange: (value: number) => void;
  onTogglePlay: () => void;
  onCloseTimeline: () => void;
  onExpandRange?: () => void;
}

const TimelineControls = ({
  t, showCalendar, showTimeline, dateMode,
  startDate, endDate, currentDate, sliderValue, isPlaying,
  availableDates, maxSliderValue = 100,
  onToggleCalendar, onSetDateMode, onSetStartDate, onSetEndDate,
  onAcceptCalendar, onSliderChange, onTogglePlay, onCloseTimeline, onExpandRange,
}: TimelineControlsProps) => {
  return (
    <div className="absolute bottom-10 right-5 md:bottom-10 md:right-10 z-30 pointer-events-auto flex flex-col items-end gap-3">

      {/* Premium Temporal Selection Modal */}
      {showCalendar && (
        <div className="bg-slate-900/40 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-2xl w-[calc(100vw-40px)] md:w-80 mb-2 animate-in fade-in slide-in-from-bottom-4 duration-300 max-h-[75vh] md:max-h-none flex flex-col">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h3 className="text-xs font-black text-emerald-400/80 uppercase tracking-[0.2em] flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5" />
              {t.timeRange}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            {/* Premium Mode Switch */}
            <div className="flex bg-slate-950/50 rounded-xl p-1 mb-5 border border-white/5 shrink-0">
              <button
                onClick={() => onSetDateMode('single')}
                className={`flex-1 text-[10px] font-black uppercase tracking-widest py-2 rounded-lg transition-all ${dateMode === 'single' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {t.singleDateMode}
              </button>
              <button
                onClick={() => onSetDateMode('range')}
                className={`flex-1 text-[10px] font-black uppercase tracking-widest py-2 rounded-lg transition-all ${dateMode === 'range' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {t.rangeDateMode}
              </button>
            </div>

            <div className="space-y-4">
              {/* Unified Calendar Selection */}
              <div className="space-y-2">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest px-1">
                  {t.dateLabel}
                </label>
                <CustomCalendar 
                  t={t}
                  dateMode={dateMode}
                  startDate={startDate}
                  endDate={endDate}
                  availableDates={availableDates}
                  onSelect={(start, end) => {
                    onSetStartDate(start);
                    onSetEndDate(end);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Color Legend Footer */}
          <div className="mt-4 pt-3 flex flex-col gap-2 border-t border-white/5 shrink-0">
            <div className="flex items-center gap-4 px-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tight">{(t as any).dataDay}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-500/30 border border-white/5" />
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">{(t as any).noDataDay}</span>
              </div>
            </div>
            
            <button
              onClick={onAcceptCalendar}
              disabled={!startDate || (dateMode === 'range' && !endDate)}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-black py-3 rounded-xl transition-all shadow-lg uppercase tracking-widest mt-1"
            >
              {t.applyFilters}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse md:flex-row gap-3 md:gap-4 items-end md:items-center w-full justify-end">
        {/* Timeline Bar */}
        {showTimeline && (
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-2.5 md:p-3 flex flex-col gap-2 shadow-2xl animate-in fade-in zoom-in-95 duration-300 w-full md:w-auto overflow-hidden">
            <div className="flex items-center gap-3 md:gap-4">
              {/* Close Button */}
              <button
                title={t.closeTimeline}
                onClick={onCloseTimeline}
                className="w-7 h-7 shrink-0 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-full flex items-center justify-center transition-colors mr-1"
              >
                <span className="text-sm font-bold leading-none select-none">✕</span>
              </button>

              {dateMode === 'single' ? (
                <div className="flex bg-slate-800/50 rounded-lg px-3 md:px-4 py-1.5 md:py-2 border border-slate-700/50 items-center justify-center flex-1 md:flex-none">
                  <CalendarDays className="w-4 h-4 text-emerald-400 mr-2 opacity-50" />
                  <span className="text-emerald-400 font-mono font-bold text-xs md:text-sm tracking-wide text-center">
                    {currentDate}
                  </span>
                </div>
              ) : (
                <>
                  <button
                    onClick={onTogglePlay}
                    className="w-9 h-9 md:w-10 md:h-10 shrink-0 bg-emerald-600 hover:bg-emerald-500 hover:scale-105 active:scale-95 rounded-full text-white transition-all shadow-[0_0_15px_rgba(52,211,153,0.3)] flex items-center justify-center"
                  >
                    {isPlaying ? (
                      <Pause fill="currentColor" className="w-3.5 h-3.5 md:w-4 md:h-4 animate-pulse" />
                    ) : (
                      <Play fill="currentColor" className="w-3.5 h-3.5 md:w-4 md:h-4 ml-0.5" />
                    )}
                  </button>

                  <div className="flex-1 min-w-[120px] md:w-64 flex flex-col justify-center">
                    <input
                      type="range"
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:h-2 transition-all"
                      min="0"
                      max={maxSliderValue}
                      value={sliderValue}
                      onChange={(e) => onSliderChange(parseInt(e.target.value, 10))}
                    />
                    <div className="flex justify-between w-full mt-1.5 md:mt-2 text-[9px] md:text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      <span>{startDate}</span>
                      <span className="text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/30 font-mono">
                        {currentDate}
                      </span>
                      <span>{endDate}</span>
                    </div>
                  </div>

                  {/* Expand Range Action - Timeline level (Compact & Emerald stringed inside the row) */}
                  {dateMode === 'range' && onExpandRange && (
                    <div className="flex md:ml-1 md:pl-3 md:border-l border-slate-700/50">
                      <button 
                        onClick={onExpandRange}
                        title={(t as any).expandRange}
                        className="w-8 h-8 md:w-10 md:h-10 shrink-0 bg-emerald-900/40 hover:bg-emerald-500/20 hover:scale-105 active:scale-95 border border-emerald-500/30 rounded-full text-emerald-400 transition-all shadow-[0_0_15px_rgba(16,185,129,0.15)] flex items-center justify-center group"
                      >
                        <ExternalLink className="w-3.5 h-3.5 md:w-4 md:h-4 group-hover:drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Always visible Calendar Button */}
        <button
          onClick={onToggleCalendar}
          className={`w-12 h-12 md:w-14 md:h-14 shrink-0 border transition-all rounded-full flex items-center justify-center shadow-2xl ${showCalendar ? 'bg-slate-800 border-emerald-500/50 text-emerald-400 scale-105' : 'bg-slate-900/90 backdrop-blur-md border-white/10 text-slate-300 hover:bg-slate-800 hover:text-white hover:scale-105'}`}
          title={t.openCalendar}
        >
          <CalendarDays className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>
    </div>
  );
};

export default TimelineControls;
