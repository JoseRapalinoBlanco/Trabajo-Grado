import { Layers, Map as MapIcon, Sun, Mountain } from 'lucide-react';
import type { TranslationSet } from '../../i18n/translations';

interface LayerSwitcherProps {
  t: TranslationSet;
  baseLayer: 'satellite' | 'dark' | 'light' | 'relief';
  showMenu: boolean;
  onToggleMenu: () => void;
  onChangeLayer: (layer: 'satellite' | 'dark' | 'light' | 'relief') => void;
}

const LayerSwitcher = ({ t, baseLayer, showMenu, onToggleMenu, onChangeLayer }: LayerSwitcherProps) => {
  const handleSelect = (layer: 'satellite' | 'dark' | 'light' | 'relief') => {
    onChangeLayer(layer);
  };

  const layers = [
    { id: 'satellite' as const, label: t.satellite, icon: Layers },
    { id: 'dark' as const, label: t.dark, icon: MapIcon },
    { id: 'light' as const, label: t.light, icon: Sun },
    { id: 'relief' as const, label: t.relief, icon: Mountain },
  ];

  return (
    <div className="absolute top-26 right-6 z-20 pointer-events-auto flex flex-col items-end gap-2 mt-12 md:mt-0">
      <button
        onClick={onToggleMenu}
        className="w-[2.2rem] h-[2.2rem] bg-slate-900/80 backdrop-blur-md border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 transition-all rounded-lg flex items-center justify-center shadow-xl"
        title={t.baseLayers}
      >
        <Layers className="w-4 h-4" />
      </button>

      {showMenu && (
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/80 rounded-xl p-1.5 shadow-2xl flex flex-col gap-0.5 w-40 animate-in fade-in slide-in-from-top-4 duration-200">
          {layers.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleSelect(id)}
              className={`p-2 hover:bg-slate-800 rounded-lg text-sm flex items-center gap-3 transition-colors w-full text-left ${baseLayer === id ? 'text-emerald-400 font-medium' : 'text-slate-400'}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LayerSwitcher;
