/**
 * Sidebar navigation component shared between both views.
 */
import { BotMessageSquare, LayoutDashboard, Cpu, Activity } from 'lucide-react';

const NAV = [
  { id: 'chat',  label: 'AI Copilot',       icon: BotMessageSquare },
  { id: 'admin', label: 'Admin Dashboard',   icon: LayoutDashboard  },
];

export default function Sidebar({ activeView, onViewChange, backendOk, role }) {
  const isPrivileged = role === 'master' || role === 'admin' || role === 'subadmin';
  const availableNav = isPrivileged ? NAV : NAV.filter(n => n.id === 'chat');
  return (
    <aside className="flex flex-col w-64 min-h-screen bg-dark-800 border-r border-white/10 p-4 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-2 py-4 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30">
          <Cpu className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <p className="font-bold text-white leading-none">SDF AI</p>
          <p className="text-[11px] text-brand-400 font-medium tracking-wider uppercase">Copilot</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {availableNav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`nav-${id}`}
            onClick={() => onViewChange(id)}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
              transition-all duration-200
              ${activeView === id
                ? 'bg-brand-600/25 text-brand-300 border border-brand-500/30 shadow-sm shadow-brand-600/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}
            `}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* Backend status */}
      <div className="mt-auto pt-4 border-t border-white/10">
        <div className="flex items-center gap-2 px-3 py-2">
          <Activity className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs text-slate-500">Backend</span>
          <span className={`ml-auto w-2 h-2 rounded-full flex-shrink-0 ${
            backendOk === null  ? 'bg-yellow-500 animate-pulse' :
            backendOk           ? 'bg-emerald-400 animate-pulse-slow' :
                                  'bg-red-500'
          }`} />
          <span className={`text-xs font-medium ${
            backendOk === null  ? 'text-yellow-400' :
            backendOk           ? 'text-emerald-400' :
                                  'text-red-400'
          }`}>
            {backendOk === null ? 'Checking…' : backendOk ? 'Online' : 'Offline'}
          </span>
        </div>
        <p className="px-3 mt-2 text-[10px] text-slate-600 leading-relaxed">
          LLM: Gemini 1.5 (Pro/Flash)<br />
          Parsing: LlamaParse<br />
          Vector DB: ChromaDB
        </p>
      </div>
    </aside>
  );
}

