import { useState, useEffect } from 'react';
import Sidebar       from './components/Sidebar';
import ChatView      from './components/ChatView';
import AdminDashboard from './components/AdminDashboard';
import { healthCheck, login } from './api';

function LoginScreen({ onLogin }) {
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
      onLogin(user);
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
          <h2 className="text-xl font-bold text-white">SDF AI Copilot</h2>
          <p className="text-xs text-slate-400 mt-1">Please login to continue</p>
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
  const [theme, setTheme]       = useState('dark');

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

  // Handle auto-routing upon login or role restrictions
  useEffect(() => {
    if (user) {
      const isPrivileged = user.role === 'master' || user.role === 'admin' || user.role === 'subadmin';
      
      if (!isPrivileged && view === 'admin') {
         // Force users back to chat if they try to access admin
         setView('chat');
      } else if (isPrivileged && view === 'chat' && !window.location.hash.includes('chat')) {
         // Admins might want to start on admin page if no explicit chat hash
         setView('admin');
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

  return (
    <div className="flex min-h-screen bg-dark-900 text-white">
      {/* Ambient gradient blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-brand-600/8 blur-3xl" />
        <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full bg-purple-700/6 blur-3xl" />
      </div>

      {!user ? (
        <LoginScreen onLogin={setUser} />
      ) : (
        <>
          <Sidebar activeView={view} onViewChange={setView} backendOk={backendOk} role={user.role} />

          <main className="flex flex-col flex-1 h-screen overflow-hidden relative z-10 w-full min-w-0">
            {/* Context switch button for demo */}
            <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
              <span className="text-xs text-slate-400 mr-2">Hello, <span className="text-white font-semibold">{user.name || user.username}</span></span>
              <button onClick={() => {setUser(null); setView('chat');}} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full bg-dark-800 border border-white/10 hover:bg-dark-700 transition lg:text-[10px]">Logout</button>
              <button 
                onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full bg-dark-800 border border-white/10 hover:bg-dark-700 transition"
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>

            <div className={view === 'chat' ? 'flex flex-col flex-1 h-full overflow-hidden' : 'hidden'}>
              <ChatView user={user} />
            </div>
            
            <div className={view === 'admin' && (user.role === 'master' || user.role === 'admin' || user.role === 'subadmin') ? 'flex flex-col flex-1 h-full overflow-hidden' : 'hidden'}>
              <AdminDashboard user={user} role={user.role} />
            </div>
          </main>
        </>
      )}
    </div>
  );
}
