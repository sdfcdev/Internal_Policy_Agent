import { useState, useEffect } from 'react';
import { BotMessageSquare, LayoutDashboard, Cpu, Activity, History, FileText, MessageSquare, DownloadCloud, Edit2, X, Check, ChevronDown, PanelLeftClose, PanelLeftOpen, Settings, Pin, Trash2, MoreVertical, Eye } from 'lucide-react';
import { renameHistorySession, togglePinSession, deleteSession, API_URL } from '../api';

const NAV = [
  { id: 'chat',  label: 'Policy Agent',       icon: BotMessageSquare },
  { id: 'admin', label: 'Admin Dashboard',   icon: LayoutDashboard  },
];

const getAvatarGradient = (username) => {
  const gradients = [
    'from-blue-400 to-indigo-500',
    'from-emerald-400 to-teal-500',
    'from-amber-400 to-orange-500',
    'from-rose-400 to-pink-500',
    'from-fuchsia-400 to-purple-500',
    'from-cyan-400 to-blue-500'
  ];
  if (!username) return gradients[0];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
};

export default function Sidebar({ 
  activeView, onViewChange, backendOk, role, 
  historyData = [], libraryDocs = [], activeSessionId, onSelectSession, onRefreshData, user,
  onNewChat, theme, onToggleTheme, onLogout,
  textSize, setTextSize, userBubbleColor, setUserBubbleColor, aiBubbleColor, setAiBubbleColor, fontStyle, setFontStyle
}) {
  const [leftTab, setLeftTab] = useState('history'); // 'history' | 'library'
  const [historySearch, setHistorySearch] = useState('');
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState('');
  const [expandedDepts, setExpandedDepts] = useState({});
  const [isOpen, setIsOpen] = useState(true); // Default to expanded
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStatusExpanded, setIsStatusExpanded] = useState(false);
  const [isPersonalizeOpen, setIsPersonalizeOpen] = useState(false);

  const groupedHistory = historyData.filter(d => d.is_saved).reduce((acc, h) => {
      if (!acc[h.session_id]) acc[h.session_id] = [];
      acc[h.session_id].push(h);
      return acc;
  }, {});
  const sessionList = Object.keys(groupedHistory).sort((a,b) => {
      const getLatest = (sId) => groupedHistory[sId].reduce((latest, msg) => {
          return new Date(msg.created_at) > new Date(latest) ? msg.created_at : latest;
      }, groupedHistory[sId][0].created_at);

      const aPinned = groupedHistory[a][0].pinned_at;
      const bPinned = groupedHistory[b][0].pinned_at;
      
      if (aPinned && bPinned) return new Date(bPinned) - new Date(aPinned);
      if (aPinned) return -1;
      if (bPinned) return 1;

      return new Date(getLatest(b)) - new Date(getLatest(a));
  });
  
  const filteredSessionList = sessionList.filter(sId => {
      if (!historySearch.trim()) return true;
      const firstQ = groupedHistory[sId][0];
      const title = firstQ.session_title || firstQ.query;
      return title.toLowerCase().includes(historySearch.toLowerCase());
  });

  async function handleRenameSubmit(sId) {
      if (!editingSessionTitle.trim()) { setEditingSessionId(null); return; }
      try {
          await renameHistorySession(sId, editingSessionTitle);
          setEditingSessionId(null);
          if (onRefreshData) onRefreshData();
      } catch (e) {
          alert('Failed to rename session.');
      }
  }

  async function handleTogglePin(e, sId, isPinned) {
      e.stopPropagation();
      try {
          await togglePinSession(sId, !isPinned);
          if (onRefreshData) onRefreshData();
      } catch (err) {
          alert('Failed to pin session.');
      }
  }

  async function handleDelete(e, sId) {
      e.stopPropagation();
      if (!window.confirm("Are you sure you want to remove this chat from your history?")) return;
      try {
          await deleteSession(sId);
          if (onRefreshData) onRefreshData();
          if (activeSessionId === sId) onNewChat();
      } catch (err) {
          alert('Failed to delete session.');
      }
  }

  const isSidebarExpanded = activeView === 'admin' ? true : isOpen;

  return (
    <aside className={`flex flex-col min-h-screen bg-dark-800 border-r border-white/10 shrink-0 z-20 transition-all duration-300 ease-in-out ${isSidebarExpanded ? 'w-72' : 'w-[88px]'}`}>
      {/* Logo Area */}
      <div className="flex flex-col items-center gap-3 px-4 py-6 border-b border-white/5 bg-dark-900/20">
        <img 
          src="/logo.png" 
          alt="Sarvodaya Logo" 
          className="h-10 w-auto object-contain brightness-110 contrast-110"
        />
        <div className={`mt-4 text-center transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0 overflow-hidden m-0'}`}>
          <p className="font-logo text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-300 via-indigo-300 to-purple-300 tracking-tight whitespace-nowrap">SDF Policy Assistant</p>
        </div>
        {activeView === 'chat' && (
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:text-brand-400 transition-colors text-slate-400 mt-2"
            title={isOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {isOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
          </button>
        )}
      </div>

      {/* Navigation Switcher (ONLY FOR PRIVILEGED USERS IN CHAT VIEW) */}
      {activeView === 'chat' && user && (user.role === 'master' || user.role === 'admin' || user.role === 'subadmin') && (
        <div className={`px-4 py-3 border-b border-white/5 bg-brand-600/5 transition-opacity duration-300 ${isSidebarExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none hidden'}`}>
           <button 
             onClick={() => onViewChange('admin')}
             className="true-color w-full py-2.5 bg-white border border-[#5D419B] rounded-xl text-xs font-black text-[#5D419B] tracking-wide hover:bg-[#F3E8FF] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-lg whitespace-nowrap"
           >
             Switch to Admin View
           </button>
        </div>
      )}

      {/* Dynamic Content Area (History/Library - ONLY IN CHAT VIEW) */}
      {activeView === 'chat' ? (
        <div className={`flex flex-col flex-1 overflow-hidden transition-opacity duration-300 ${isSidebarExpanded ? 'opacity-100' : 'opacity-0 hidden pointer-events-none'}`}>
          <div className="p-3 border-b border-white/5">
            <button 
               onClick={() => { if(onNewChat) onNewChat(); }}
               className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all font-bold text-sm shadow-sm tracking-wide"
            >
               <BotMessageSquare className="w-4 h-4" />
               New chat
            </button>
          </div>
          <div className="flex items-center gap-1 p-2 border-b border-white/5 select-none bg-dark-900/10">
             <button 
               onClick={()=>setLeftTab('history')} 
               className={`flex-1 py-1.5 text-sm font-bold rounded transition-colors whitespace-nowrap ${leftTab==='history' ? 'bg-brand-600/20 text-brand-300' : 'text-slate-500 hover:bg-white/5'}`}
             >
               Past Chats
             </button>
             <button 
               onClick={()=>setLeftTab('library')} 
               className={`flex-1 py-1.5 text-sm font-bold rounded transition-colors whitespace-nowrap ${leftTab==='library' ? 'bg-brand-600/20 text-brand-300' : 'text-slate-500 hover:bg-white/5'}`}
             >
               Library
             </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {leftTab === 'history' ? (
              <div className="p-3 space-y-3">
                <input 
                   type="text"
                   placeholder="Search chats..."
                   value={historySearch}
                   onChange={e => setHistorySearch(e.target.value)}
                   className="input-field text-xs py-2 px-3 w-full bg-dark-900 border-white/5 placeholder-slate-600"
                />
                <div className="space-y-2">
                  {filteredSessionList.map(sId => {
                    const qs = groupedHistory[sId];
                    const firstQ = qs[0];
                    const isActive = activeSessionId === sId;
                    return (
                      <div 
                        key={sId}
                        className={`group relative p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isActive 
                            ? 'bg-brand-600/10 border-brand-500/40 shadow-sm' 
                            : 'bg-white/2 border-white/5 hover:bg-white/5'
                        }`}
                        onClick={() => {
                          const restoredMsgs = [];
                          [...qs].reverse().forEach((h) => {
                             const isGreeting = h.response.startsWith('Hi ') && h.response.includes('How can I help you');
                             const dateStr = h.created_at.endsWith('Z') ? h.created_at : h.created_at + 'Z';
                             restoredMsgs.push({ id: h.id + "_u", role: 'user', content: h.query, time: new Date(dateStr).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) });
                             restoredMsgs.push({ id: h.id + "_a", role: 'assistant', content: h.response, time: new Date(dateStr).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), active_agent: 'Done', hallucination_check: isGreeting ? '' : 'pass' });
                          });
                          onSelectSession({ id: sId, messages: restoredMsgs });
                        }}
                      >
                        {editingSessionId === sId ? (
                          <div className="flex items-center gap-1">
                            <input 
                              autoFocus 
                              className="bg-dark-900 text-[10px] w-full p-1 rounded border border-brand-500"
                              value={editingSessionTitle}
                              onChange={e => setEditingSessionTitle(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleRenameSubmit(sId)}
                            />
                            <button onClick={() => handleRenameSubmit(sId)} className="text-emerald-400"><Check className="w-3 h-3"/></button>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-start">
                              <p className="text-xs text-slate-300 line-clamp-2 pr-6 leading-relaxed font-normal">
                                {firstQ.pinned_at && <Pin className="w-3 h-3 inline mr-1 text-amber-400 rotate-45" />}
                                {firstQ.session_title || firstQ.query}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 opacity-60">
                              <span className="text-[10px] text-slate-500 font-mono">{new Date(firstQ.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 group/menu">
                              <button className="p-1 text-slate-400 hover:text-white" onClick={e => e.stopPropagation()}>
                                <MoreVertical className="w-4 h-4"/>
                              </button>
                              <div className="absolute right-0 top-full bg-dark-800 border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all flex flex-col min-w-[110px] overflow-hidden">
                                <button onClick={(e) => handleTogglePin(e, sId, !!firstQ.pinned_at)} className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-300 hover:bg-white/5 text-left w-full">
                                  <Pin className="w-3 h-3"/> {firstQ.pinned_at ? "Unpin" : "Pin"}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setEditingSessionTitle(firstQ.session_title || firstQ.query); setEditingSessionId(sId); }} className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-300 hover:bg-white/5 text-left w-full">
                                  <Edit2 className="w-3 h-3"/> Rename
                                </button>
                                <button onClick={(e) => handleDelete(e, sId)} className="flex items-center gap-2 px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 text-left w-full border-t border-white/5">
                                  <Trash2 className="w-3 h-3"/> Delete
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {filteredSessionList.length === 0 && (
                    <p className="text-xs text-slate-600 text-center py-10 italic">No history found.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {/* Grouped Library by Department */}
                {Object.keys(
                  libraryDocs.reduce((acc, doc) => {
                    const dept = (doc.department || 'General').trim();
                    if (!acc[dept]) acc[dept] = [];
                    acc[dept].push(doc);
                    return acc;
                  }, {})
                ).sort().map(dept => {
                  const docsInDept = libraryDocs.filter(d => (d.department || 'General').trim() === dept);
                  const isExpanded = !!expandedDepts[dept];
                  
                  return (
                    <div key={dept} className="flex flex-col border border-white/5 rounded-xl bg-white/2 overflow-hidden shadow-sm shadow-black/20">
                      <button 
                        onClick={() => setExpandedDepts(prev => ({ ...prev, [dept]: !prev[dept] }))}
                        className={`flex items-center justify-between px-3 py-3 text-xs font-medium uppercase tracking-widest transition-all duration-300 ${isExpanded ? 'bg-brand-600/30 text-brand-300' : 'text-slate-400 hover:bg-white/5'}`}
                      >
                        <div className="flex items-center gap-2 flex-1 overflow-hidden text-left">
                           <LayoutDashboard className={`w-4 h-4 shrink-0 transition-transform duration-300 ${isExpanded ? 'scale-110' : 'opacity-40'}`} />
                           <span className="truncate" title={dept}>{dept}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] bg-dark-900/50 px-1.5 py-0.5 rounded-md border border-white/10">{docsInDept.length}</span>
                           <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-brand-400' : 'text-slate-600'}`} />
                        </div>
                      </button>
                      
                      {isExpanded && (
                        <div className="flex flex-col border-t border-white/5 bg-dark-900/40 animate-fade-in">
                          {docsInDept.map(doc => (
                            <a 
                              key={doc.id} 
                              href={`${API_URL}/uploads/${doc.filename}`} 
                              target="_blank"  
                              rel="noreferrer"
                              className="flex items-center gap-3 p-3 hover:bg-brand-600/10 transition-all group border-b border-white/5 last:border-0"
                            >
                              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                                <FileText className="w-3.5 h-3.5 text-emerald-500/60" />
                              </div>
                              <span className="text-[11px] text-slate-400 truncate flex-1 font-semibold group-hover:text-slate-200" title={doc.filename}>{doc.filename}</span>
                              <Eye className="w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {libraryDocs.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 opacity-30">
                    <FileText className="w-8 h-8 mb-2" />
                    <p className="text-[10px] text-slate-400 italic">Library is empty.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-dark-900/20">
           <div className="w-16 h-16 rounded-3xl bg-brand-600/10 border border-brand-500/20 flex items-center justify-center mb-4">
              <LayoutDashboard className="w-8 h-8 text-brand-400" />
           </div>
           <p className="text-xs font-bold text-white uppercase tracking-widest mb-1">Admin Mode</p>
           <p className="text-[10px] text-slate-500 leading-relaxed mb-8 px-4">Chat history and library are disabled while managing the system.</p>
           
           <div className="w-full px-2">
              <button 
                onClick={() => onViewChange('chat')}
                className="btn-primary w-full py-3 rounded-xl text-xs font-black tracking-wide shadow-xl shadow-brand-600/20"
              >
                Switch to Agent View
              </button>
           </div>
        </div>
      )}

      {/* User Profile Area */}
      <div className={`mt-auto border-t border-white/5 bg-dark-900/30 transition-all duration-300 ${isSidebarExpanded ? 'p-4' : 'p-3 flex flex-col items-center gap-3'} relative`}>
        <div className={`flex ${isSidebarExpanded ? 'items-center justify-between' : 'flex-col items-center gap-3'}`}>
          <div className={`flex items-center gap-2.5 ${isSidebarExpanded ? '' : 'hidden'}`}>
            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarGradient(user?.username)} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-lg border border-white/20`}>
              {(user?.preferred_name || user?.name || user?.username || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-white truncate max-w-[100px] leading-tight">{user?.preferred_name || user?.name || user?.username}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-tighter mt-0.5">{user?.role}</span>
            </div>
          </div>
          
          <div className="relative">
             <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition group flex-shrink-0 text-slate-400 hover:text-white"
              title="Settings"
            >
              <Settings className={`w-4 h-4 transition-transform duration-300 ${isSettingsOpen ? 'rotate-90 text-white' : ''}`} />
            </button>
            
            {/* Settings Popover */}
            {isSettingsOpen && (
               <>
                 <div className="fixed inset-0 z-40" onClick={() => setIsSettingsOpen(false)} />
                 <div className={`absolute bottom-full mb-3 w-44 bg-dark-800 border border-white/10 rounded-2xl shadow-2xl p-2 flex flex-col gap-1 z-50 animate-slide-up ${isSidebarExpanded ? 'right-0' : 'left-0'}`}>
                    <button 
                      onClick={() => { setIsPersonalizeOpen(true); setIsSettingsOpen(false); }}
                      className="w-full flex items-center justify-between px-3 py-2 mb-1 group cursor-pointer hover:bg-white/5 rounded-xl transition-colors"
                    >
                      <span className="text-sm font-normal text-slate-300 group-hover:text-white transition-colors">
                        Personalize
                      </span>
                    </button>
                    <div 
                      onClick={(e) => { e.stopPropagation(); onToggleTheme(); }}
                      className="flex items-center justify-between px-3 py-2 mb-1 group cursor-pointer hover:bg-white/5 rounded-xl transition-colors"
                    >
                      <span className="text-sm font-normal text-slate-300 group-hover:text-white transition-colors">
                        {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                      </span>
                      <div
                        className={`relative flex items-center h-6 w-11 rounded-full p-1 transition-colors duration-500 ${
                          theme === 'dark' ? 'bg-brand-400/80' : 'bg-slate-500/50'
                        }`}
                      >
                        <div
                          className={`absolute w-4 h-4 rounded-full shadow-md transform transition-transform duration-500 flex items-center justify-center bg-white ${
                            theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        >
                          {theme === 'dark' ? <span className="text-[10px] leading-none">🌙</span> : <span className="text-[10px] leading-none">☀️</span>}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => { onLogout(); setIsSettingsOpen(false); }}
                      className="flex items-center justify-center px-3 py-2 text-sm font-normal text-red-400 hover:text-white hover:bg-red-500/20 rounded-xl transition-colors mt-0.5"
                    >
                      <span>Log out</span>
                    </button>
                 </div>
               </>
            )}
          </div>
        </div>
      </div>
      
      {/* Personalize Modal */}
      {isPersonalizeOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" onClick={() => setIsPersonalizeOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-dark-800 border border-white/10 rounded-2xl shadow-2xl z-[101] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">Personalize UI</h2>
              <button onClick={() => setIsPersonalizeOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 flex flex-col gap-5">
              {/* Font Style */}
              <div>
                <label className="block text-sm text-slate-300 mb-2">Font Family</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Inter', 'Comic Sans MS', 'Poppins', 'Outfit'].map(font => (
                    <button
                      key={font}
                      onClick={() => setFontStyle(font)}
                      className={`py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        fontStyle === font 
                          ? 'bg-brand-500/20 border-brand-500 text-brand-400' 
                          : 'bg-dark-900 border-white/5 text-slate-400 hover:border-white/20'
                      }`}
                      style={{ fontFamily: font }}
                    >
                      {font}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Size */}
              <div>
                <label className="block text-sm text-slate-300 mb-2">Text Size</label>
                <div className="flex gap-2">
                  {['sm', 'md', 'lg'].map(size => (
                    <button
                      key={size}
                      onClick={() => setTextSize(size)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        textSize === size 
                          ? 'bg-brand-500/20 border-brand-500 text-brand-400' 
                          : 'bg-dark-900 border-white/5 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      {size === 'sm' ? 'Small' : size === 'md' ? 'Medium' : 'Large'}
                    </button>
                  ))}
                </div>
              </div>

              {/* User Bubble Color */}
              <div>
                <label className="block text-sm text-slate-300 mb-2">User Chat Color</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'blue', name: 'Blue', color: 'bg-blue-500' },
                    { id: 'emerald', name: 'Emerald', color: 'bg-emerald-500' },
                    { id: 'violet', name: 'Violet', color: 'bg-violet-500' },
                    { id: 'teal', name: 'Teal', color: 'bg-teal-500' },
                    { id: 'orange', name: 'Orange', color: 'bg-orange-500' },
                    { id: 'fuchsia', name: 'Fuchsia', color: 'bg-fuchsia-500' }
                  ].map(c => (
                    <button
                      key={c.id}
                      onClick={() => setUserBubbleColor(c.id)}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition-colors border flex items-center gap-1.5 ${
                        userBubbleColor === c.id 
                          ? 'bg-white/10 border-white/20 text-white' 
                          : 'bg-dark-900 border-white/5 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${c.color} shrink-0`} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Bubble Color */}
              <div>
                <label className="block text-sm text-slate-300 mb-2">AI Answer Color</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'white', name: 'Glass', color: 'bg-white' },
                    { id: 'slate', name: 'Slate', color: 'bg-slate-400' },
                    { id: 'indigo', name: 'Indigo', color: 'bg-indigo-400' },
                    { id: 'zinc', name: 'Zinc', color: 'bg-zinc-400' },
                    { id: 'stone', name: 'Stone', color: 'bg-stone-400' },
                    { id: 'neutral', name: 'Neutral', color: 'bg-neutral-400' }
                  ].map(c => (
                    <button
                      key={c.id}
                      onClick={() => setAiBubbleColor(c.id)}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition-colors border flex items-center gap-1.5 ${
                        aiBubbleColor === c.id 
                          ? 'bg-white/10 border-white/20 text-white' 
                          : 'bg-dark-900 border-white/5 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${c.color} shrink-0`} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset to Default */}
              <button
                onClick={() => {
                  setFontStyle('Inter');
                  setTextSize('md');
                  setUserBubbleColor('blue');
                  setAiBubbleColor('white');
                }}
                className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:text-white bg-dark-900 border border-white/5 hover:border-white/20 transition-colors flex items-center justify-center gap-2"
              >
                Reset to Default
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
