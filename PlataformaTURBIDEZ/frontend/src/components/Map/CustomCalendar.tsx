import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import type { TranslationSet } from '../../i18n/translations';

interface CustomCalendarProps {
  t: TranslationSet;
  dateMode: 'single' | 'range';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  availableDates: string[]; // ['2024-01-14', ...]
  onSelect: (start: string, end: string) => void;
}

type NavMode = 'calendar' | 'month' | 'year';

const CustomCalendar = ({ t, dateMode, startDate, endDate, availableDates, onSelect }: CustomCalendarProps) => {
  const [viewDate, setViewDate] = useState(new Date(startDate || new Date()));
  const [navMode, setNavMode] = useState<NavMode>('calendar');
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  
  const currentMonth = viewDate.getMonth();
  const currentYear = viewDate.getFullYear();

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 20 }, (_, i) => current - 10 + i);
  }, []);

  const handlePrevMonth = () => setViewDate(new Date(currentYear, currentMonth - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(currentYear, currentMonth + 1, 1));

  const formatDate = (day: number) => 
    `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const isDataDay = (dateStr: string) => availableDates.includes(dateStr);

  const isInRange = (dateStr: string) => {
    if (dateMode === 'single') return dateStr === startDate;
    if (!startDate || !endDate) return false;
    return dateStr >= startDate && dateStr <= endDate;
  };

  const isRangeBound = (dateStr: string) => {
    return dateStr === startDate || (dateMode === 'range' && dateStr === endDate);
  };

  const isHoveredInRange = (dateStr: string) => {
    if (dateMode !== 'range' || !startDate || endDate || !hoverDate) return false;
    const [d_start, d_hover] = [startDate, hoverDate].sort();
    return dateStr >= d_start && dateStr <= d_hover;
  };

  const handleDateClick = (dateStr: string) => {
    if (dateMode === 'single') {
      onSelect(dateStr, dateStr);
    } else {
      if (!startDate || (startDate && endDate)) {
        // First click or resetting range
        onSelect(dateStr, '');
      } else {
        // Second click
        if (dateStr < startDate) {
          onSelect(dateStr, '');
        } else {
          onSelect(startDate, dateStr);
        }
      }
    }
  };

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  return (
    <div className="bg-slate-950/60 rounded-xl border border-white/5 p-3 flex flex-col gap-3 relative overflow-hidden min-h-[300px]">
      
      {/* Selection Mode Overlay: Month Picker */}
      {navMode === 'month' && (
        <div className="absolute inset-x-3 inset-y-12 z-50 bg-slate-950/90 backdrop-blur-md rounded-lg grid grid-cols-3 gap-2 p-2 animate-in fade-in zoom-in-95 duration-200">
          {(t as any).months.map((m: string, idx: number) => (
            <button
              key={m}
              onClick={() => { setViewDate(new Date(currentYear, idx, 1)); setNavMode('calendar'); }}
              className={`text-[10px] font-bold uppercase p-2 rounded-lg transition-all ${idx === currentMonth ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              {m.substring(0, 3)}
            </button>
          ))}
        </div>
      )}

      {/* Selection Mode Overlay: Year Picker */}
      {navMode === 'year' && (
        <div className="absolute inset-x-3 inset-y-12 z-50 bg-slate-950/90 backdrop-blur-md rounded-lg grid grid-cols-4 gap-2 p-2 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
          {years.map(y => (
            <button
              key={y}
              onClick={() => { setViewDate(new Date(y, currentMonth, 1)); setNavMode('calendar'); }}
              className={`text-[10px] font-bold py-2 rounded-lg transition-all ${y === currentYear ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Calendar Header */}
      <div className="flex justify-between items-center px-1">
        <button 
          onClick={handlePrevMonth}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        
        <div className="flex gap-1">
          <button 
            onClick={() => setNavMode(navMode === 'month' ? 'calendar' : 'month')}
            className="text-[11px] font-black text-slate-200 uppercase tracking-widest hover:text-emerald-400 transition-colors"
          >
            {(t as any).months[currentMonth]}
          </button>
          <button 
            onClick={() => setNavMode(navMode === 'year' ? 'calendar' : 'year')}
            className="text-[11px] font-black text-slate-400 hover:text-emerald-400 transition-colors"
          >
            {currentYear}
          </button>
        </div>

        <button 
          onClick={handleNextMonth}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Week Days */}
      <div className="grid grid-cols-7 gap-1">
        {(t as any).daysOfWeek.map((day: string, idx: number) => (
          <div key={idx} className="text-[9px] font-black text-slate-600 text-center uppercase py-1">
            {day}
          </div>
        ))}
        {blanks.map(b => <div key={`b-${b}`} />)}
        {days.map(day => {
          const dateStr = formatDate(day);
          const hasData = isDataDay(dateStr);
          const active = isInRange(dateStr);
          const bound = isRangeBound(dateStr);
          const hovered = isHoveredInRange(dateStr);
          
          return (
            <button
              key={day}
              disabled={!hasData}
              onMouseEnter={() => setHoverDate(dateStr)}
              onMouseLeave={() => setHoverDate(null)}
              onClick={() => handleDateClick(dateStr)}
              className={`
                aspect-square text-[10px] font-bold transition-all flex items-center justify-center relative group
                ${hasData 
                  ? active || hovered
                    ? bound 
                      ? 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.5)] rounded-lg z-10' 
                      : 'bg-emerald-500/30 text-emerald-400 z-0'
                    : 'hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg' 
                  : 'text-slate-500/40 cursor-not-allowed border border-white/5 rounded-lg'}
                ${active && !bound && 'rounded-none'}
              `}
            >
              {day}
              {hasData && !active && !hovered && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-500/40 group-hover:bg-emerald-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="mt-auto pt-2 border-t border-white/5 flex flex-col gap-2">
         <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <CalendarIcon className="w-3 h-3 text-emerald-500/50" />
              <span className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[180px]">
                {startDate ? startDate : '----/--/--'} 
                {dateMode === 'range' && ` → ${endDate || '..../../..'}`}
              </span>
            </div>
             {startDate && !endDate && dateMode === 'range' && (
               <div className="flex items-center gap-1 animate-pulse">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  <span className="text-[8px] text-emerald-400 font-black uppercase tracking-tighter">Seleccionar fin</span>
               </div>
            )}
         </div>
         
         {/* Availability Legend */}
         <div className="flex items-center justify-between px-1 mt-1 pt-2 border-t border-white/5 opacity-80">
           <div className="flex items-center gap-1.5">
             <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
               <span className="w-1 h-1 rounded-full bg-emerald-500/80"></span>
             </div>
             <span className="text-[8px] text-slate-400 uppercase tracking-widest font-bold">Días c/Datos</span>
           </div>
           <div className="flex items-center gap-1.5">
             <div className="w-2.5 h-2.5 rounded-sm border border-white/5 bg-slate-900/50"></div>
             <span className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">Sin Datos</span>
           </div>
         </div>
      </div>
    </div>
  );
};

export default CustomCalendar;
