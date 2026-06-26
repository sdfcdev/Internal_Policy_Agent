import { useState, useEffect } from 'react';
import { Download, Eye, EyeOff } from 'lucide-react';
import Sidebar       from './components/Sidebar';
import ChatView      from './components/ChatView';
import AdminDashboard from './components/AdminDashboard';
import Register      from './components/Register';
import ForgotPassword from './components/ForgotPassword';
import { healthCheck, login } from './api';

function LoginScreen({ onLogin, onForgotPassword, onRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError('');
    try {
      const user = await login(username, password);
      // Auto-route based on role
      const isPrivileged = user.role === 'master' || user.role === 'admin' || user.role === 'subadmin';
      onLogin(user, isPrivileged ? 'admin' : 'chat');
    } catch (e) {
      setError(e.response?.data?.detail || 'Login failed. Invalid credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8 w-full relative min-h-screen py-12 overflow-hidden" style={{ backgroundColor: '#ffffff' }}>
      {/* Background Image shifted right using object-position instead of translate to avoid scrollbars/gaps */}
      <img src="/login-bg.jpg" alt="background" className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none animate-slide-up-bg" style={{ objectPosition: 'calc(100% + 150px) center', backgroundColor: '#ffffff' }} />

      {/* Login Box - Made dark so the white text is clearly readable against the white background */}
      <div className="bg-dark-900/95 backdrop-blur-md p-8 w-full max-w-sm glow-ring animate-fade-in z-10 relative rounded-2xl border border-dark-700 shadow-2xl">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="SDF Logo" className="h-10 w-auto mx-auto mb-4 brightness-110" />
          <h2 className="text-2xl font-normal text-white tracking-tight">SDF Policy Assistant</h2>
          <p className="text-sm text-slate-400 mt-1">Authorized Staff Access Only</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[13px] text-slate-400 mb-1">Employee Number</label>
            <input type="text" name="username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} disabled={loading} required className="input-field py-2.5 text-base w-full" autoFocus />
          </div>
          <div className="relative">
            <label className="block text-[13px] text-slate-400 mb-1">Password</label>
            <input type={showPassword ? "text" : "password"} name="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={loading} required className="input-field py-2.5 text-base w-full pr-10" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-[34px] text-slate-400 hover:text-white transition">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex justify-between items-center mt-2">
            <button type="button" onClick={onRegister} className="true-color text-xs text-[#5D419B] font-bold hover:opacity-80 underline transition">New Staff? Register</button>
            <button type="button" onClick={onForgotPassword} className="text-xs text-slate-400 hover:text-white underline transition">Forgot Password?</button>
          </div>
          {error && <div className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 p-2 rounded">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2 rounded-lg font-medium shadow-sm transition">
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
          
          <div className="text-center mt-8">
            <p className="true-color text-[13px] font-medium text-[#B7371F] tracking-wide">
              IT Help Desk Support : 2626
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView]         = useState('chat');   // 'chat' | 'admin'
  const [user, setUser]         = useState(null);     // { username, role, name, emp_num }
  const [backendOk, setBackend] = useState(null);
  const [theme, setTheme]       = useState('light');

  // Personalization State
  const [textSize, setTextSize] = useState('md');
  const [userBubbleColor, setUserBubbleColor] = useState('blue');
  const [aiBubbleColor, setAiBubbleColor] = useState('white');
  const [fontStyle, setFontStyle] = useState('Inter');

  // Load user-specific preferences on login
  useEffect(() => {
    if (user?.username) {
      setTextSize(localStorage.getItem(`sdf_text_size_${user.username}`) || 'md');
      setUserBubbleColor(localStorage.getItem(`sdf_user_color_${user.username}`) || 'blue');
      setAiBubbleColor(localStorage.getItem(`sdf_ai_color_${user.username}`) || 'white');
      setFontStyle(localStorage.getItem(`sdf_font_style_${user.username}`) || 'Inter');
    }
  }, [user?.username]);

  // Save user-specific preferences
  useEffect(() => { if (user?.username) localStorage.setItem(`sdf_text_size_${user.username}`, textSize); }, [textSize, user?.username]);
  useEffect(() => { if (user?.username) localStorage.setItem(`sdf_user_color_${user.username}`, userBubbleColor); }, [userBubbleColor, user?.username]);
  useEffect(() => { if (user?.username) localStorage.setItem(`sdf_ai_color_${user.username}`, aiBubbleColor); }, [aiBubbleColor, user?.username]);
  useEffect(() => { if (user?.username) localStorage.setItem(`sdf_font_style_${user.username}`, fontStyle); }, [fontStyle, user?.username]);



  // Lifted Chat State
  const [historyData, setHistoryData] = useState([]);
  const [libraryDocs, setLibraryDocs] = useState([]);
  const [sessionId, setSessionId]     = useState('');
  const [messages, setMessages]       = useState([]);
  const [saveChat, setSaveChat]       = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Handle URL-based routing
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#/', '');
      if (hash === 'admin' || hash === 'chat') {
        setView(hash);
      }
    };
    
    // Check initial hash
    if (!window.location.hash) {
      window.location.hash = '#/chat';
    } else {
      handleHash();
    }

    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Update URL when view changes
  useEffect(() => {
    window.location.hash = `#/${view}`;
  }, [view]);

  // Removed automatic hash-based switching that might conflict with our new role-based logic
  useEffect(() => {
    if (user) {
      const isPrivileged = user.role === 'master' || user.role === 'admin' || user.role === 'subadmin';
      if (!isPrivileged && view === 'admin') {
         setView('chat');
      }
    }
  }, [user, view]);

  // Apply theme to document
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, [theme]);

  // Poll backend health every 15 seconds
  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        await healthCheck();
        if (mounted) setBackend(true);
      } catch {
        if (mounted) setBackend(false);
      }
    }

    check();
    const interval = setInterval(check, 15_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Sync data when user changes
  useEffect(() => {
    if (user) {
      loadChatData();
    }
  }, [user]);

  async function loadChatData() {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const [hist, docs] = await Promise.all([
        import('./api').then(m => m.getChatHistory(user.username)),
        import('./api').then(m => m.getDocuments())
      ]);
      setHistoryData(hist);
      setLibraryDocs(docs);
    } catch (e) {
      console.error("Failed to load chat data:", e);
    } finally {
      setLoadingHistory(false);
    }
  }

  const handleDownloadPDF = async () => {
    let sessionName = 'Current Chat Session';
    if (sessionId) {
      const savedSessionMsg = historyData.find(h => h.session_id === sessionId);
      if (savedSessionMsg && savedSessionMsg.session_title) {
        sessionName = savedSessionMsg.session_title;
      } else if (messages.length > 0) {
        const firstUserMsg = messages.find(m => m.role === 'user');
        if (firstUserMsg) {
          sessionName = firstUserMsg.content.substring(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '');
        }
      }
    }
    const dateStr = new Date().toLocaleString();

    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.async = true;
      document.body.appendChild(script);
      await new Promise((resolve) => {
        script.onload = resolve;
        setTimeout(resolve, 3000);
      });
    }

    if (!window.html2pdf) {
      alert("Failed to load PDF library. Please check your internet connection.");
      return;
    }

    const htmlContent = `
      <div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; background: #ffffff; padding: 30px;">
        <h1 style="color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 5px; font-size: 24px;">Chat Session Name: ${sessionName}</h1>
        <div style="color: #64748b; font-size: 13px; margin-bottom: 30px;">Date & Time Exported: ${dateStr}</div>
        ${messages.map(msg => `
          <div style="margin-bottom: 24px; padding: 16px; border-radius: 12px; ${msg.role === 'user' ? 'background: #f8fafc; border: 1px solid #e2e8f0;' : 'background: #ffffff; border-left: 4px solid #8b5cf6; border-top: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;'}">
            <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px; display: flex; justify-content: space-between;">
              <span style="color: ${msg.role === 'user' ? '#3b82f6' : '#8b5cf6'}">${msg.role === 'user' ? (user?.preferred_name || user?.name || 'User') : 'SDF Policy Assistant'}</span>
              <span style="font-size: 12px; color: #94a3b8; font-weight: normal;">${msg.time || ''}</span>
            </div>
            <div style="white-space: pre-wrap; font-size: 14px; color: #334155; line-height: 1.6;">${msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          </div>
        `).join('')}
      </div>
    `;

    const opt = {
      margin:       [10, 10, 10, 10],
      filename:     `${sessionName}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    window.html2pdf().from(htmlContent).set(opt).save();
  };

  return (
    <div className={`flex w-full min-h-screen ${!user ? 'bg-white' : 'bg-dark-900'} text-white`} style={{ fontFamily: `"${fontStyle}", system-ui, sans-serif` }}>
      {/* Ambient gradient blobs (only show in dark mode / when logged in) */}
      {user && (
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-brand-600/8 blur-3xl" />
          <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full bg-purple-700/6 blur-3xl" />
        </div>
      )}

      {(!user && view !== 'forgot-password' && view !== 'register') && (
        <LoginScreen 
          onLogin={(userData, initialView) => {
            setUser(userData);
            setView(initialView);
          }} 
          onForgotPassword={() => setView('forgot-password')} 
          onRegister={() => setView('register')} 
        />
      )}

      {view === 'forgot-password' && (
        <ForgotPassword onBack={() => setView('chat')} />
      )}

      {view === 'register' && (
        <Register onBack={() => setView('chat')} onComplete={setUser} />
      )}

      {user && (
        <>
          <Sidebar 
            activeView={view} 
            onViewChange={setView} 
            backendOk={backendOk} 
            role={user.role}
            historyData={historyData}
            libraryDocs={libraryDocs}
            activeSessionId={sessionId}
            onSelectSession={(session) => {
               setSessionId(session.id);
               setMessages(session.messages);
               setSaveChat(true);
            }}
            onNewChat={() => {
               setSessionId('');
               setMessages([]);
               setSaveChat(false);
            }}
            onRefreshData={loadChatData}
            user={user}
            theme={theme}
            onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            onLogout={() => {setUser(null); setView('chat'); setSessionId(''); setMessages([]); setSaveChat(false);}}
            textSize={textSize} setTextSize={setTextSize}
            userBubbleColor={userBubbleColor} setUserBubbleColor={setUserBubbleColor}
            aiBubbleColor={aiBubbleColor} setAiBubbleColor={setAiBubbleColor}
            fontStyle={fontStyle} setFontStyle={setFontStyle}
          />

          <main className="flex flex-col flex-1 h-screen overflow-hidden relative z-10 w-full min-w-0">
            {/* Top Header Bar */}
            <header className="h-20 flex items-center justify-between px-8 bg-dark-900/50 backdrop-blur-md border-b border-white/5 shrink-0">
              <div className="flex items-center gap-4">
                {view === 'admin' && (
                  <>
                    <div className="h-10 w-[3px] bg-brand-500 rounded-full hidden lg:block" />
                    <div>
                      <h1 className="text-sm font-bold text-white tracking-widest uppercase">
                        {user.role === 'subadmin' ? 'Sub-Administrative Dashboard' : 'Administrative Dashboard'}
                      </h1>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        Manage knowledge base documents and system logs
                      </p>
                    </div>
                  </>
                )}
              </div>
              
              <div className="flex items-center gap-4 ml-auto">
                {view === 'chat' && messages.length > 0 && (
                   <button 
                     onClick={handleDownloadPDF} 
                     className="p-2.5 bg-dark-800 border border-white/10 rounded-xl shadow-xl hover:bg-white/10 transition flex items-center gap-2"
                     title="Download Chat"
                   >
                     <Download className="w-4 h-4 text-brand-400" />
                     <span className="text-xs text-slate-300 font-semibold hidden sm:inline">Download Chat</span>
                   </button>
                )}
              </div>
            </header>

            <div className={view === 'chat' ? 'flex flex-col flex-1 h-full overflow-hidden' : 'hidden'}>
              <ChatView 
                user={user} 
                historyData={historyData} 
                libraryDocs={libraryDocs}
                sessionId={sessionId}
                setSessionId={setSessionId}
                messages={messages}
                setMessages={setMessages}
                saveChat={saveChat}
                setSaveChat={setSaveChat}
                onRefreshHistory={loadChatData}
                textSize={textSize}
                userBubbleColor={userBubbleColor}
                aiBubbleColor={aiBubbleColor}
              />
            </div>
            
            <div className={view === 'admin' && (user.role === 'master' || user.role === 'admin' || user.role === 'subadmin') ? 'flex flex-col flex-1 h-full overflow-hidden' : 'hidden'}>
              <AdminDashboard user={user} role={user.role} />
            </div>

            {/* Global Footer */}
            <footer className="py-4 border-t border-white/5 bg-dark-900/80 backdrop-blur-sm text-center shrink-0">
               <p className="text-[10px] text-slate-500 tracking-wide font-normal">
                 © 2026 Sarvodaya Development Finance. All rights reserved.
               </p>
               <p className="text-[10px] text-slate-500 tracking-wide font-normal mt-1">
                 Solution by AI Engineering Team
               </p>
            </footer>
          </main>
        </>
      )}
    </div>
  );
}
