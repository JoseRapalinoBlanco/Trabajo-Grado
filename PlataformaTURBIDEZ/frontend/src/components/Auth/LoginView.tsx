import { useState } from 'react';
import { ChevronRight, User, Eye, EyeOff } from 'lucide-react';
import type { TranslationSet } from '../../i18n/translations';
import * as api from '../../services/api';

interface LoginViewProps {
  t: TranslationSet;
  lang: string;
  onLoginSuccess: (token: string) => void;
  onBack: () => void;
}

const LoginView = ({ t, onLoginSuccess, onBack }: LoginViewProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const data = await api.login(email, password);
      localStorage.setItem('admin_token', data.access_token);
      onLoginSuccess(data.access_token);
    } catch {
      setLoginError(t.loginErrorMsg);
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
      <button
        onClick={onBack}
        className="absolute top-8 left-8 text-slate-400 hover:text-white flex items-center gap-2 font-semibold transition-colors"
      >
        <ChevronRight className="w-5 h-5 rotate-180" /> {t.backToMap}
      </button>

      <div className="bg-slate-900 border border-slate-700/50 p-8 rounded-2xl shadow-2xl w-full max-w-sm animate-in slide-in-from-bottom-8 duration-500">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-emerald-500/10 p-4 rounded-full mb-4">
            <User className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t.adminLoginTitle}</h2>
          <p className="text-xs text-slate-400 mt-2 font-medium tracking-wide uppercase">{t.appTitle} - {t.appSubtitle}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          {loginError && <p className="text-red-400 text-xs text-center">{loginError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t.email}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@cartagena.co"
              required
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none transition-all placeholder:text-slate-600"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t.password}</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 pr-10 text-sm text-slate-300 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none transition-all placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg mt-2 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:-translate-y-0.5 transition-all">
            {t.signIn}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginView;
