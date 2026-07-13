import { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, Square } from 'lucide-react';
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
  const agents = ['Starting', 'Researcher', 'Communicator', 'Reviewer', 'Done'];
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
    user, sessionId, setSessionId, messages, setMessages, saveChat, setSaveChat, onRefreshHistory,
    textSize, userBubbleColor, aiBubbleColor
}) {
  const [query, setQuery]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const abortControllerRef = useRef(null);
  const scrollContainerRef = useRef(null);

  function stopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }

  useEffect(() => {
    if (user && !sessionId) {
       startNewChat();
    }
  }, [user, sessionId]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      return;
    }
    // If user has scrolled up even a tiny bit (10px), don't force them back down
    const isScrolledUp = container.scrollHeight - container.scrollTop - container.clientHeight > 10;
    if (!isScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, loading]);

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

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // OPTIMIZATION #6 (Cost & Security): 3-Second Debounce Delay (Edit Grace Period)
      // Gives the user 3 seconds to realize a typo and click Stop before ANY API calls are made.
      setMessages(prev => prev.map(msg => 
        msg.id === tempAssistantId ? { ...msg, active_agent: 'Waiting (3s)... Click Stop to edit' } : msg
      ));
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // If user clicked the Stop button during the 3 seconds
      if (controller.signal.aborted) {
        setMessages(currentHist); // Remove the pending messages
        if (overrideQuery === null) setQuery(q); // Put the text back in the box so they can edit
        setLoading(false);
        return; // Exit immediately, saving API cost!
      }

      setMessages(prev => prev.map(msg => 
        msg.id === tempAssistantId ? { ...msg, active_agent: 'Initializing...' } : msg
      ));

      const res = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, employee_id: user.username, session_id: sessionId, save_chat: saveChat }),
        signal: controller.signal
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
      if (err.name === 'AbortError') {
        setMessages(prev => prev.map(msg => msg.id === tempAssistantId ? { ...msg, active_agent: 'Stopped' } : msg));
        return;
      }
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
          {/* 
            OPTIMIZATION #8 (UI/UX): Enter Key Behavior
            Pressing Enter (without Shift) will submit the message.
            Pressing Shift + Enter will add a new line.
          */}
          <textarea 
            ref={inputRef} 
            value={query} 
            onChange={e => setQuery(e.target.value)} 
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Prevent default new line
                if (query.trim() && !loading) {
                  handleSend(e);
                }
              }
            }}
            placeholder="Ask SDF Policy Assistant..." 
            disabled={loading} 
            rows={query.split('\n').length > 3 ? 3 : query.split('\n').length || 1}
            style={{ minHeight: '52px', resize: 'none' }}
            className="input-field w-full text-base py-3.5 px-5 pr-14 bg-white/5 border-white/10 focus:border-brand-500/50 transition-all rounded-2xl custom-scrollbar" 
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8">
            {loading && (
              <svg className="animate-spin absolute inset-0 w-8 h-8 text-rose-500/50" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <button 
              type="button"
              onClick={loading ? stopGeneration : undefined}
              disabled={!loading}
              className={`relative p-1.5 rounded-lg transition-all flex items-center justify-center z-10 ${
                loading 
                  ? 'text-rose-500 hover:text-rose-400 bg-dark-900 shadow-sm cursor-pointer' 
                  : 'text-slate-600 bg-transparent cursor-default'
              }`}
              title={loading ? "Stop Generation" : ""}
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          </div>
        </div>
        
        {/* 
          OPTIMIZATION #7 (Spam Prevention): 
          The Send button is completely disabled while loading (isGenerating).
          Users can only send a new query after the current one finishes or is stopped.
        */}
        <button 
          type="submit" 
          disabled={loading || !query.trim()} 
          className={`w-14 h-[52px] flex items-center justify-center rounded-2xl shadow-lg transition-all shrink-0 self-end ${
            loading || !query.trim() 
              ? 'bg-dark-600 text-slate-500 border border-white/5 shadow-none cursor-not-allowed' 
              : 'btn-primary shadow-brand-600/20 active:scale-95'
          }`}
        >
          <Send className="w-6 h-6 ml-0.5" /> 
        </button>
      </form>
      
      <div className="text-center mt-2">
        <p className="text-[10px] text-slate-500 font-medium tracking-wide">
          <strong className="text-slate-400 font-bold">SDF Policy Assistant is AI</strong> and can make mistakes.
        </p>
      </div>
      
      {messages.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-4 mt-4 px-2">
           <label className="flex items-center gap-3 cursor-pointer group">
             <span className={`text-[11px] font-semibold tracking-wide transition-colors ${saveChat ? 'text-brand-400' : 'text-slate-500'}`}>
               Save Chat
             </span>
             <div className="relative">
               <input type="checkbox" className="sr-only peer" checked={saveChat} onChange={e => handleToggleSave(e.target.checked)} />
               <div className={`block w-9 h-5 rounded-full transition-all ${saveChat ? 'bg-brand-500 shadow-[0_0_10px_rgba(139,92,246,0.3)]' : 'bg-dark-600 border border-white/10 group-hover:border-white/20'}`}></div>
               <div className={`absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform duration-200 ${saveChat ? 'translate-x-4' : 'translate-x-0'}`}></div>
             </div>
           </label>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full relative bg-dark-900/40">
      
      {messages.length > 0 && user?.role !== 'user' && <AgentPipeline activeAgent={activeAgentNav} />}

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
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6 custom-scrollbar">
          {messages.map((msg, i) => (
             <MessageBubble 
                key={`${msg.id}-${i}`} 
                message={msg} 
                onEditSubmit={handleEditSubmit} 
                textSize={textSize}
                userBubbleColor={userBubbleColor}
                aiBubbleColor={aiBubbleColor}
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
