import { useState, useEffect } from 'react';
import { Activity, Globe, User, X, Menu, LayoutDashboard, FileJson, Settings, CheckCircle, Upload, Satellite } from 'lucide-react';
import type { TranslationSet, Lang } from '../../i18n/translations';
import * as api from '../../services/api';

interface AdminPanelProps {
  t: TranslationSet;
  lang: Lang;
  token: string;
  onLogout: () => void;
  onToggleLang: () => void;
}

const AdminPanel = ({ t, lang, token, onLogout, onToggleLang }: AdminPanelProps) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [adminTab, setAdminTab] = useState<'dashboard' | 'invite' | 'data'>('dashboard');
  const [dataSubTab, setDataSubTab] = useState<'upload' | 'view' | 'clean' | 'download'>('view');

  // Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  // Upload
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  // Data View
  const [tableData, setTableData] = useState<any[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [dataFilterStart, setDataFilterStart] = useState('');
  const [dataFilterEnd, setDataFilterEnd] = useState('');

  // Clean
  const [showCleanWarning, setShowCleanWarning] = useState(false);
  const [showCleanPassword, setShowCleanPassword] = useState(false);
  const [cleanPasswordInput, setCleanPasswordInput] = useState('');
  const [cleanMessage, setCleanMessage] = useState('');

  // Download
  const [downloadFormat, setDownloadFormat] = useState<'csv' | 'json' | 'txt' | 'xlsx'>('csv');
  const [isDownloading, setIsDownloading] = useState(false);

  // Satellite toggle for admin operations
  const [adminSatellite, setAdminSatellite] = useState<'S2' | 'S3'>('S3');

  useEffect(() => {
    if (adminTab === 'data' && dataSubTab === 'view') {
      fetchData();
    }
  }, [adminTab, dataSubTab, dataFilterStart, dataFilterEnd, adminSatellite]);

  const fetchData = async () => {
    try {
      const json = await api.fetchTableData(token, { startDate: dataFilterStart || undefined, endDate: dataFilterEnd || undefined, satellite: adminSatellite });
      setTableData(json.data);
      setTotalRecords(json.total);
    } catch (e) { console.error(e); }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInviting(true);
    setInviteMessage('');
    try {
      await api.inviteAdmin(token, inviteEmail);
      setInviteMessage(t.inviteSuccess);
      setInviteEmail('');
    } catch (err: any) {
      setInviteMessage(err.message);
    } finally { setIsInviting(false); }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setIsUploading(true);
    setUploadMessage('');
    try {
      const data = await api.uploadData(token, file, adminSatellite);
      setUploadMessage(`${t.uploadSuccess} ${data.inserted_count} ${t.points}`);
      setFile(null);
    } catch (err: any) {
      setUploadMessage(`Error: ${err.message}`);
    } finally { setIsUploading(false); }
  };

  const handleCleanDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanPasswordInput) return;
    setCleanMessage('');
    try {
      const data = await api.deleteData(token, {
        password: cleanPasswordInput,
        startDate: dataFilterStart || null,
        endDate: dataFilterEnd || null,
        satellite: adminSatellite
      });
      setCleanMessage(`${t.successDeleted} ${data.deleted_count} ${t.pointsSuccess}`);
      setShowCleanPassword(false);
      setShowCleanWarning(false);
      setCleanPasswordInput('');
      if (dataSubTab === 'view') fetchData();
    } catch (err: any) {
      setCleanMessage(`Error: ${err.message}`);
    }
  };

  const handleDownloadData = async () => {
    setIsDownloading(true);
    try {
      const blob = await api.downloadAdminData(token, downloadFormat, dataFilterStart || undefined, dataFilterEnd || undefined, adminSatellite);
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.setAttribute('download', `turbidity_data.${downloadFormat}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) { console.error(e); }
    finally { setIsDownloading(false); }
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-950 flex flex-row animate-in fade-in duration-300 overflow-hidden">
      {/* Admin Sidebar */}
      <div className={`w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full absolute md:relative z-20 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-6 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/20 p-2 rounded-lg">
              <Activity className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t.adminPanel}</h2>
              <p className="text-xs text-slate-400 uppercase tracking-widest">{t.appTitle}</p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-2 px-4">
          <button onClick={() => setAdminTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm ${adminTab === 'dashboard' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}>
            <LayoutDashboard className="w-5 h-5" /> {t.dashboard}
          </button>
          <button onClick={() => setAdminTab('invite')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm ${adminTab === 'invite' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}>
            <User className="w-5 h-5" /> {t.inviteAdmin}
          </button>
          <button onClick={() => setAdminTab('data')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm ${adminTab === 'data' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}>
            <FileJson className="w-5 h-5" /> {t.dataManagement}
          </button>
        </div>

        <div className="p-6 border-t border-slate-800">
          <button
            onClick={onToggleLang}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition-colors border border-slate-700 font-semibold text-sm text-slate-300"
          >
            <Globe className="w-4 h-4" /> {lang === 'es' ? 'EN / ES' : 'ES / EN'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
        {/* Top Navbar */}
        <div className="bg-slate-900/50 border-b border-slate-800 p-4 px-8 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-slate-400 hover:text-white bg-slate-800/50 rounded-lg">
            <Menu className="w-5 h-5" />
          </button>
          <button
            onClick={onLogout}
            className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-sm font-bold transition-all flex items-center gap-2 border border-red-500/20"
          >
            <User className="w-4 h-4" /> {t.logout}
          </button>
        </div>

        {/* Dashboard Content */}
        <div className="flex-1 p-8 overflow-y-auto w-full">
          <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">

            {/* Dashboard Tab */}
            {adminTab === 'dashboard' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl space-y-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 rounded-xl">
                    <Settings className="w-6 h-6 text-emerald-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white">{t.adminWelcome}</h3>
                </div>
                <p className="text-slate-400 leading-relaxed text-lg">{t.adminWelcomeDesc}</p>
                <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t.systemStatus}</span>
                  <span className="text-sm font-black text-emerald-400 bg-emerald-400/10 px-4 py-1.5 rounded-full border border-emerald-400/20 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    {t.operational}
                  </span>
                </div>
              </div>
            )}

            {/* Invite Tab */}
            {adminTab === 'invite' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl max-w-xl">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-blue-500/10 rounded-xl">
                    <User className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white">{t.inviteAdmin}</h3>
                </div>
                <form onSubmit={handleInvite} className="space-y-6">
                  {inviteMessage && (
                    <div className={`p-4 rounded-xl text-sm font-bold flex items-center gap-3 ${inviteMessage.includes('exito') || inviteMessage.includes('successfully') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                      {(inviteMessage.includes('exito') || inviteMessage.includes('successfully')) && <CheckCircle className="w-5 h-5" />}
                      {inviteMessage}
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">{t.inviteEmail}</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="admin@unicartagena.edu.co"
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-base text-slate-300 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 focus:outline-none transition-all placeholder:text-slate-600 shadow-inner"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isInviting}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl mt-4 transition-all flex justify-center items-center shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40"
                  >
                    {isInviting ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : t.sendInvite}
                  </button>
                  <p className="text-xs font-medium text-slate-500 mt-4 text-center">{t.inviteNotice}</p>
                </form>
              </div>
            )}

            {/* Data Management Tab */}
            {adminTab === 'data' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col min-h-[600px]">
                {/* Sub navigation */}
                <div className="p-6 border-b border-slate-800 bg-slate-900/80">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-purple-500/10 rounded-xl">
                      <FileJson className="w-6 h-6 text-purple-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">{t.dataManagement}</h3>
                  </div>
                  <div className="flex gap-2 p-1 bg-slate-950/50 rounded-xl overflow-x-auto">
                    <button onClick={() => setDataSubTab('view')} className={`flex-1 min-w-[120px] py-2 px-4 rounded-lg font-bold text-sm transition-all ${dataSubTab === 'view' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>{t.viewData}</button>
                    <button onClick={() => setDataSubTab('upload')} className={`flex-1 min-w-[120px] py-2 px-4 rounded-lg font-bold text-sm transition-all ${dataSubTab === 'upload' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>{t.uploadData}</button>
                    <button onClick={() => setDataSubTab('download')} className={`flex-1 min-w-[120px] py-2 px-4 rounded-lg font-bold text-sm transition-all ${dataSubTab === 'download' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>{t.downloadData}</button>
                    <button onClick={() => setDataSubTab('clean')} className={`flex-1 min-w-[120px] py-2 px-4 rounded-lg font-bold text-sm transition-all ${dataSubTab === 'clean' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'}`}>{t.cleanData}</button>
                  </div>

                  {/* Satellite Toggle */}
                  <div className="mt-4 flex items-center gap-3">
                    <Satellite className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Satélite:</span>
                    <div className="flex gap-1 p-1 bg-slate-950/50 rounded-lg border border-slate-800">
                      <button
                        onClick={() => setAdminSatellite('S3')}
                        className={`py-1.5 px-4 rounded-md text-xs font-bold transition-all ${adminSatellite === 'S3' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
                      >
                        Sentinel-3
                      </button>
                      <button
                        onClick={() => setAdminSatellite('S2')}
                        className={`py-1.5 px-4 rounded-md text-xs font-bold transition-all ${adminSatellite === 'S2' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
                      >
                        Sentinel-2
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-6 flex-1 flex flex-col">
                  {/* VIEW DATA */}
                  {dataSubTab === 'view' && (
                    <div className="flex flex-col h-full animate-in fade-in">
                      <div className="flex flex-wrap gap-4 items-end mb-4 bg-slate-900/50 p-4 rounded-lg border border-slate-800/80">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">{t.dateFrom}</label>
                          <input type="date" value={dataFilterStart} onChange={(e) => setDataFilterStart(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-slate-200 transition-colors focus:border-slate-600 focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">{t.dateTo}</label>
                          <input type="date" value={dataFilterEnd} onChange={(e) => setDataFilterEnd(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-slate-200 transition-colors focus:border-slate-600 focus:outline-none" />
                        </div>
                        <div className="flex-1 text-right">
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-950 px-2 py-1 rounded inline-block border border-slate-800/50">
                            {t.totalPoints} <strong className="text-white">{totalRecords}</strong> {t.points}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto rounded-lg border border-slate-800 bg-slate-950/30">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-slate-900 sticky top-0 z-10 shadow-sm">
                            <tr>
                              <th className="p-3 font-semibold text-slate-400 border-b border-slate-800">{t.dateRef}</th>
                              <th className="p-3 font-semibold text-slate-400 border-b border-slate-800">{t.latitude}</th>
                              <th className="p-3 font-semibold text-slate-400 border-b border-slate-800">{t.longitude}</th>
                              {adminSatellite === 'S2' ? (
                                <>
                                  <th className="p-3 font-semibold text-slate-400 border-b border-slate-800">TUR_Eljaiek</th>
                                  <th className="p-3 font-semibold text-slate-400 border-b border-slate-800">TUR_Dogliotti</th>
                                  <th className="p-3 font-semibold text-slate-400 border-b border-slate-800">TUR_Nechad</th>
                                </>
                              ) : (
                                <>
                                  <th className="p-3 font-semibold text-slate-400 border-b border-slate-800">Rrs_665</th>
                                  <th className="p-3 font-semibold text-slate-400 border-b border-slate-800">TT_pred</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {tableData.length === 0 ? (
                              <tr><td colSpan={adminSatellite === 'S2' ? 6 : 5} className="p-8 text-center text-slate-500 italic">{t.noData}</td></tr>
                            ) : (
                              tableData.map(row => (
                                <tr key={row.id} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
                                  <td className="p-3 text-slate-400 font-mono">{new Date(row.date).toISOString().split('T')[0]}</td>
                                  <td className="p-3 text-slate-500 font-mono">{row.latitude?.toFixed(6)}</td>
                                  <td className="p-3 text-slate-500 font-mono">{row.longitude?.toFixed(6)}</td>
                                  {adminSatellite === 'S2' ? (
                                    <>
                                      <td className="p-3 text-slate-400 font-mono">{row.tur_eljaiek?.toFixed(4)}</td>
                                      <td className="p-3 text-slate-400 font-mono">{row.tur_dogliotti2015?.toFixed(4)}</td>
                                      <td className="p-3 text-white font-mono bg-slate-800/10">{row.tur_nechad2009_665?.toFixed(4)}</td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="p-3 text-slate-400 font-mono">{row.rrs_665?.toFixed(6)}</td>
                                      <td className="p-3 text-white font-mono bg-slate-800/10">{row.tt_pred?.toFixed(4)}</td>
                                    </>
                                  )}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* UPLOAD DATA */}
                  {dataSubTab === 'upload' && (
                    <div className="animate-in fade-in max-w-2xl mx-auto w-full pt-4">
                      <p className="text-slate-400 mb-8 font-medium leading-relaxed text-center">{t.uploadDesc}</p>
                      <form onSubmit={handleFileUpload} className="space-y-6">
                        {uploadMessage && (
                          <div className={`p-4 rounded-xl text-sm font-bold flex items-center gap-3 ${uploadMessage.includes('exitosa') || uploadMessage.includes('success') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                            {(uploadMessage.includes('exitosa') || uploadMessage.includes('success')) && <CheckCircle className="w-5 h-5" />}
                            {uploadMessage}
                          </div>
                        )}
                        <div className={`border-2 border-dashed ${file ? 'border-purple-500/50 bg-slate-950/80' : 'border-slate-700/50 bg-slate-950/50'} rounded-2xl p-10 flex flex-col items-center justify-center transition-all hover:border-purple-500/50 hover:bg-slate-950`}>
                          <Upload className={`w-12 h-12 mb-4 transition-colors ${file ? 'text-purple-400' : 'text-slate-500'}`} />
                          <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3 px-6 rounded-xl transition-all shadow-lg text-sm">
                            {t.selectFile}
                            <input type="file" accept=".json,.csv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} />
                          </label>
                          {file && (
                            <div className="mt-6 flex items-center gap-2 text-purple-400 font-mono text-sm bg-purple-500/10 px-4 py-2 rounded-lg border border-purple-500/20">
                              <FileJson className="w-4 h-4" />
                              {file.name} ({(file.size / 1024).toFixed(2)} KB)
                            </div>
                          )}
                        </div>
                        <button type="submit" disabled={!file || isUploading} className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white font-bold py-4 rounded-xl mt-4 transition-all flex justify-center items-center shadow-lg shadow-purple-900/20 hover:shadow-purple-900/40">
                          {isUploading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : t.uploadButton}
                        </button>
                      </form>
                    </div>
                  )}

                  {/* CLEAN DATABASE */}
                  {dataSubTab === 'clean' && (
                    <div className="animate-in fade-in max-w-2xl mx-auto w-full pt-4">
                      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center space-y-6">
                        <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Activity className="w-8 h-8" />
                        </div>
                        <h4 className="text-xl font-bold text-white">{t.cleanData}</h4>
                        <p className="text-red-400 font-medium text-sm">{t.deleteWarning}</p>
                        {(dataFilterStart || dataFilterEnd) ? (
                          <div className="bg-slate-950/50 p-4 rounded-xl border border-red-500/30 text-sm text-slate-300">
                            <strong>{t.cleanWarningFilter}:</strong> <strong>{dataFilterStart || t.filterStart}</strong> {t.filterUntil} <strong>{dataFilterEnd || t.filterToday}</strong>.
                          </div>
                        ) : (
                          <div className="bg-slate-950/50 p-4 rounded-xl border border-red-500/30 text-sm text-red-400 font-bold">{t.cleanWarningTitle}</div>
                        )}
                        {cleanMessage && (
                          <div className={`p-4 rounded-xl text-sm font-bold ${cleanMessage.includes('exito') || cleanMessage.includes('Successfully') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/20 text-red-300 border border-red-500/50'}`}>{cleanMessage}</div>
                        )}
                        {!showCleanWarning && !showCleanPassword && (
                          <button onClick={() => setShowCleanWarning(true)} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-red-900/20 transition-all font-mono tracking-wider">{t.initiatePurge}</button>
                        )}
                        {showCleanWarning && !showCleanPassword && (
                          <div className="animate-in zoom-in-95 space-y-4">
                            <p className="text-white font-bold">{t.cleanConfirmAsk}</p>
                            <div className="flex gap-4">
                              <button onClick={() => setShowCleanWarning(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all">{t.cancel}</button>
                              <button onClick={() => setShowCleanPassword(true)} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all">{t.deleteConfirm}</button>
                            </div>
                          </div>
                        )}
                        {showCleanPassword && (
                          <form onSubmit={handleCleanDatabase} className="animate-in slide-in-from-bottom-4 space-y-4 text-left bg-slate-950/80 p-6 rounded-xl border border-red-500/30">
                            <label className="text-xs font-bold text-red-400 uppercase tracking-widest block mb-2">{t.passwordConfirmPrompt}</label>
                            <input type="password" value={cleanPasswordInput} onChange={(e) => setCleanPasswordInput(e.target.value)} placeholder="••••••••" required className="w-full bg-slate-900 border border-red-500/50 rounded-xl p-4 text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500" />
                            <div className="flex gap-4 mt-4">
                              <button type="button" onClick={() => { setShowCleanPassword(false); setShowCleanWarning(false); }} className="px-6 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all">{t.cancel}</button>
                              <button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all tracking-wider">{t.permanentDelete}</button>
                            </div>
                          </form>
                        )}
                      </div>
                    </div>
                  )}

                  {/* DOWNLOAD DATA */}
                  {dataSubTab === 'download' && (
                    <div className="animate-in fade-in max-w-2xl mx-auto w-full pt-4">
                      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-xl">
                        <div className="flex items-center gap-4 mb-8 justify-center">
                          <div className="p-3 bg-blue-500/10 rounded-xl">
                            <Activity className="w-6 h-6 text-blue-400" />
                          </div>
                          <h3 className="text-2xl font-bold text-white">{t.downloadData}</h3>
                        </div>
                        <div className="space-y-6">
                          <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3">{t.downloadFormat}</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {(['csv', 'json', 'txt', 'xlsx'] as const).map(fmt => (
                                <button key={fmt} onClick={() => setDownloadFormat(fmt)} className={`py-3 border-2 rounded-xl font-bold font-mono text-sm transition-all ${downloadFormat === fmt ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-slate-800 bg-slate-950 text-slate-500 hover:border-slate-600'}`}>
                                  {t[`format${fmt.toUpperCase()}` as keyof typeof t] as string}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 text-sm text-slate-300">
                            <strong>{t.filterApplied}:</strong> <strong>{dataFilterStart || t.filterStart}</strong> {t.filterUntil} <strong>{dataFilterEnd || t.filterToday}</strong>.
                            <br /><span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{t.filterChangeNotice}</span>
                          </div>
                          <button onClick={handleDownloadData} disabled={isDownloading} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-3 tracking-widest">
                            {isDownloading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : t.downloadNow}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
