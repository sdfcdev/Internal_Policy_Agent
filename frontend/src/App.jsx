import { useState, useEffect } from 'react';
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
    <div className="flex flex-1 items-center justify-center p-8 z-10 w-full relative h-[100vh]">
      <div className="glass-card p-8 w-full max-w-sm glow-ring animate-fade-in">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="SDF Logo" className="h-12 w-auto mx-auto mb-4 brightness-110" />
          <h2 className="text-xl font-bold text-white tracking-tight">AI Internal Policy Agent</h2>
          <p className="text-xs text-slate-400 mt-1">Authorized Staff Access Only</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Username</label>
            <input type="text" value={username} onChange={e=>setUsername(e.target.value)} disabled={loading} required className="input-field py-2 text-sm w-full" autoFocus />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} disabled={loading} required className="input-field py-2 text-sm w-full" />
          </div>
          <div className="flex justify-between items-center">
            <button type="button" onClick={onRegister} className="text-[10px] text-brand-400 hover:text-brand-300 underline transition">New Staff? Register</button>
            <button type="button" onClick={onForgotPassword} className="text-[10px] text-slate-400 hover:text-white underline transition">Forgot Password?</button>
          </div>
          {error && <div className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 p-2 rounded">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2 rounded-lg font-medium shadow-sm transition">
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
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

  return (
    <div className="flex min-h-screen bg-dark-900 text-white">
      {/* Ambient gradient blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-brand-600/8 blur-3xl" />
        <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full bg-purple-700/6 blur-3xl" />
      </div>

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
            onRefreshData={loadChatData}
            user={user}
          />

          <main className="flex flex-col flex-1 h-screen overflow-hidden relative z-10 w-full min-w-0">
            {/* Top Header Bar */}
            <header className="h-20 flex items-center justify-between px-8 bg-dark-900/50 backdrop-blur-md border-b border-white/5 shrink-0">
              <div className="flex items-center gap-4">
                <div className="h-10 w-[3px] bg-brand-500 rounded-full hidden lg:block" />
                <div>
                  <h1 className="text-sm font-bold text-white tracking-widest uppercase">
                    {view === 'admin' 
                      ? (user.role === 'subadmin' ? 'Sub-Administrative Dashboard' : 'Administrative Dashboard') 
                      : 'User Dashboard'}
                  </h1>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {view === 'admin' 
                      ? 'Manage knowledge base documents and system logs' 
                      : 'Access policy documents, query history, and generated responses'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end mr-2">
                  <span className="text-xs font-semibold text-white leading-none">{user.name || user.username}</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-tighter mt-1">{user.role}</span>
                </div>
                
                <div className="flex items-center gap-2">
                   <button 
                    onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                    className="p-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition group"
                    title="Toggle Theme"
                  >
                    {theme === 'dark' ? <span className="text-sm">☀️</span> : <span className="text-sm">🌙</span>}
                  </button>
                  
                  <button 
                    onClick={() => {setUser(null); setView('chat');}} 
                    className="px-4 py-1.5 text-xs font-bold rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition shadow-sm"
                  >
                    LOGOUT
                  </button>
                </div>
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
