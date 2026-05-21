import { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, RefreshCw } from 'lucide-react';
import { API_URL, saveHistorySession } from '../api';
import MessageBubble, { TypingIndicator } from './MessageBubble';

const PLACEHOLDER_HINTS = [
  'What is the leave encashment policy?',
  'Explain the work-from-home guidelines.',
  'How does the appraisal process work?',
  'What are the travel reimbursement rules?',
];

function nowTime(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function AgentPipeline({ activeAgent }) {
  const agents = ['Starting', 'Researcher', 'Compliance', 'Communicator', 'Reviewer', 'Done'];
  let currentIndex = agents.indexOf(activeAgent);
  if (currentIndex === -1) currentIndex = 0;

  return (
    <div className="z-20 sticky top-0 flex items-center justify-center gap-1.5 py-3 border-b border-white/10 bg-dark-900/95 backdrop-blur-sm px-4 overflow-x-auto select-none shadow-md w-full shrink-0">
      {agents.map((agent, i) => {
        const isPast = i < currentIndex;
        const isActive = i === currentIndex;
        return (
          <div key={agent} className="flex items-center gap-1.5 whitespace-nowrap">
            <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              isActive ? 'bg-brand-600 text-white border-brand-500 animate-pulse' :
              isPast ? 'bg-emerald-900/50 text-emerald-400 border-emerald-700/50' :
              'bg-dark-600 text-slate-500 border-white/5'
            }`}>
              {agent}
            </div>
            {i !== agents.length - 1 && <div className={`w-3 h-[1px] ${isPast ? 'bg-emerald-700/50' : 'bg-white/10'}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function ChatView({ 
    user, sessionId, setSessionId, messages, setMessages, saveChat, setSaveChat, onRefreshHistory 
}) {
  const [query, setQuery]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    if (user && !sessionId) {
       startNewChat();
    }
  }, [user, sessionId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  function startNewChat() {
    const freshSession = Date.now().toString();
    setSessionId(freshSession);
    setSaveChat(false);
    setMessages([]);
  }

  async function handleSend(e, overrideQuery = null, overrideMessages = null) {
    if (e) e.preventDefault();
    const q = (overrideQuery !== null ? overrideQuery : query).trim();
    if (!q || loading) return;

    const userMsg = { id: Date.now(), role: 'user', content: q, time: nowTime() };
    const tempAssistantId = Date.now() + 1;
    const currentHist = overrideMessages !== null ? overrideMessages : messages;
    
    setMessages([
      ...currentHist,
      userMsg,
      { id: tempAssistantId, role: 'assistant', content: '', time: nowTime(), active_agent: 'Initializinging...' }
    ]);
    
    if (overrideQuery === null) setQuery('');
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, employee_id: user.username, session_id: sessionId, save_chat: saveChat })
      });

      if (!res.ok) throw new Error('Network response was not ok');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr === '[DONE]') {
                done = true;
                break;
              }
              try {
                const data = JSON.parse(dataStr);
                if (data.error) {
                  setError(data.error);
                  done = true;
                  break;
                }
                setMessages(prev => prev.map(msg => {
                  if (msg.id === tempAssistantId) {
                    return {
                      ...msg,
                      content: data.response || msg.content,
                      active_agent: data.agent,
                      hallucination_check: data.hallucination_check,
                      accuracy_score: data.accuracy_score
                    };
                  }
                  return msg;
                }));
              } catch (e) {
                console.error("JSON parse error for SSE chunk", e);
              }
            }
          }
        }
      }

      if (onRefreshHistory) onRefreshHistory();
    } catch (err) {
      setError(`Agent pipeline error: ${err.message}`);
    } finally {
      setLoading(false);
      setMessages(prev => prev.map(msg => msg.id === tempAssistantId ? { ...msg, active_agent: 'Done' } : msg));
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function handleToggleSave(checked) {
      setSaveChat(checked);
      if (checked && sessionId && messages.length > 1) {
          try {
              await saveHistorySession(sessionId);
              if (onRefreshHistory) onRefreshHistory();
          } catch (e) {
              console.error("Failed to retroactively save session:", e);
          }
      }
  }

  async function handleEditSubmit(newQuery, msgId) {
      const idx = messages.findIndex(m => m.id === msgId);
      if (idx === -1) return;
      const truncated = messages.slice(0, idx);
      handleSend(null, newQuery, truncated);
  }

  const activeAgentNav = messages.length > 0 ? messages[messages.length - 1].active_agent || 'Done' : 'Done';
  
  const InputForm = (
    <div className="w-full">
      <form onSubmit={handleSend} className="flex items-center gap-3 w-full">
        <div className="flex-1 relative group">
          <input 
            ref={inputRef} 
            type="text" 
            value={query} 
            onChange={e => setQuery(e.target.value)} 
            placeholder="Ask SDF Policy Agent..." 
            disabled={loading} 
            className="input-field w-full text-base py-3.5 px-5 bg-white/5 border-white/10 focus:border-brand-500/50 transition-all rounded-2xl" 
          />
          <button 
            type="button"
            onClick={startNewChat}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-white/5 transition-all"
            title="Start New Chat"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <button 
          type="submit" 
          disabled={loading || !query.trim()} 
          className="btn-primary px-6 h-12 flex items-center justify-center gap-2 rounded-2xl shadow-lg shadow-brand-600/20 active:scale-95 transition-transform"
        >
          <Send className="w-4 h-4" /> 
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
      
      {messages.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-4 mt-4 px-2">
           <label className="flex items-center gap-3 cursor-pointer group">
             <span className={`text-[10px] font-bold tracking-tight transition-colors ${saveChat ? 'text-emerald-400' : 'text-slate-500'}`}>
               SAVE HISTORY
             </span>
             <div className="relative">
               <input type="checkbox" className="sr-only peer" checked={saveChat} onChange={e => handleToggleSave(e.target.checked)} />
               <div className={`block w-9 h-5 rounded-full transition-all ${saveChat ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-dark-600 border border-white/10 group-hover:border-white/20'}`}></div>
               <div className={`absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform duration-200 ${saveChat ? 'translate-x-4' : 'translate-x-0'}`}></div>
             </div>
           </label>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full relative bg-dark-900/40">
      
      {messages.length > 0 && <AgentPipeline activeAgent={activeAgentNav} />}

      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in overflow-y-auto custom-scrollbar">
           <div className="max-w-3xl w-full flex flex-col items-center mt-[-5vh]">
              <h1 className="text-4xl sm:text-5xl font-medium text-transparent bg-clip-text bg-gradient-to-r from-brand-300 via-purple-300 to-brand-400 mb-3 text-center tracking-tight">
                 Hello, {user?.preferred_name || user?.name?.split(' ')[0] || user?.username}
              </h1>
              <h2 className="text-2xl sm:text-3xl font-medium text-slate-400 text-center mb-12">
                 How can I help you today?
              </h2>
              
              <div className="w-full max-w-2xl bg-dark-900/50 backdrop-blur-xl rounded-3xl p-3 border border-white/5 shadow-2xl">
                 {InputForm}
              </div>
           </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6 custom-scrollbar">
          {messages.map((msg, i) => (
             <MessageBubble 
                key={`${msg.id}-${i}`} 
                message={msg} 
                onEditSubmit={handleEditSubmit} 
             />
          ))}
          {loading && <TypingIndicator />}
          {error && <div className="glass-card border-red-500/30 bg-red-900/10 px-4 py-3 animate-fade-in"><p className="text-red-400 text-sm">{error}</p></div>}
          <div ref={bottomRef} />
        </div>
      )}

      {messages.length > 0 && (
        <div className="px-4 sm:px-8 py-6 border-t border-white/5 bg-dark-900/80 backdrop-blur-xl shrink-0">
          <div className="max-w-4xl mx-auto">
            {InputForm}
          </div>
        </div>
      )}
      
    </div>
  );
}
