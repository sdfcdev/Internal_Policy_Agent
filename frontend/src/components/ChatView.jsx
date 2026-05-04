import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, MessageSquare, RefreshCw, History, FileText, DownloadCloud, Edit2, X, Check } from 'lucide-react';
import { getChatHistory, getDocuments, saveHistorySession, renameHistorySession } from '../api';
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
    <div className="z-20 sticky top-0 flex items-center justify-center gap-1.5 py-3 border-b border-white/10 bg-dark-900/95 backdrop-blur-sm px-4 mt-0.5 overflow-x-auto select-none shadow-md w-full">
      {agents.map((agent, i) => {
        const isPast = i < currentIndex;
        const isActive = i === currentIndex;
        return (
          <div key={agent} className="flex items-center gap-1.5 whitespace-nowrap">
            <div className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
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

export default function ChatView({ user }) {
  const [employeeId, setEmployeeId] = useState('');
  const [sessionId, setSessionId]   = useState('');
  const [messages, setMessages]     = useState([]);
  const [query, setQuery]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  
  const [leftTab, setLeftTab]       = useState('history'); // 'history' | 'library'
  const [historyData, setHistoryData] = useState([]);
  const [libraryDocs, setLibraryDocs] = useState([]);
  
  const [saveChat, setSaveChat]     = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  const [hint] = useState(() => PLACEHOLDER_HINTS[Math.floor(Math.random() * PLACEHOLDER_HINTS.length)]);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const loadData = useCallback(async (id) => {
    try {
      const hist = await getChatHistory(id);
      setHistoryData(hist);
      const docs = await getDocuments();
      setLibraryDocs(docs);
    } catch(e) {
      console.error("Failed to load user data:", e);
    }
  }, []);

  useEffect(() => {
    if (user && !employeeId) {
       setEmployeeId(user.username);
       startNewChat();
       loadData(user.username);
    }
  }, [user, employeeId, loadData]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  function startNewChat() {
    const freshSession = Date.now().toString();
    setSessionId(freshSession);
    setSaveChat(false); // default unsaved
    setMessages([
      {
        id: Date.now(),
        role: 'assistant',
        content: `Started a new chat session. How can I help you, **${user?.name || user?.username}**?`,
        time: nowTime(),
      },
    ]);
  }

  function handleReset() {
    startNewChat();
    setError('');
  }

  async function handleSend(e, overrideQuery = null, overrideMessages = null) {
    if (e) e.preventDefault();
    const q = (overrideQuery !== null ? overrideQuery : query).trim();
    if (!q || loading) return;

    const userMsg = { id: Date.now(), role: 'user', content: q, time: nowTime() };
    const tempAssistantId = Date.now() + 1;
    
    // Use the overridden history (e.g. for edits) or current messages
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
      const res = await fetch('http://127.0.0.1:8000/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, employee_id: employeeId, session_id: sessionId, save_chat: saveChat })
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

      loadData(employeeId);
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
              loadData(employeeId); // refresh sidebar history immediately
          } catch (e) {
              console.error("Failed to retroactively save session:", e);
          }
      }
  }

  async function handleEditSubmit(newQuery, msgId) {
      const idx = messages.findIndex(m => m.id === msgId);
      if (idx === -1) return;
      // Truncate the messages up to the old query
      const truncated = messages.slice(0, idx);
      handleSend(null, newQuery, truncated);
  }

  async function handleRenameSubmit(sId) {
      if (!editingSessionTitle.trim()) { setEditingSessionId(null); return; }
      try {
          await renameHistorySession(sId, editingSessionTitle);
          setEditingSessionId(null);
          loadData(employeeId);
      } catch (e) {
          alert('Failed to rename session.');
      }
  }

  const activeAgentNav = messages.length > 0 ? messages[messages.length - 1].active_agent || 'Done' : 'Done';
  
  const groupedHistory = historyData.filter(d => d.is_saved).reduce((acc, h) => {
      if (!acc[h.session_id]) acc[h.session_id] = [];
      acc[h.session_id].push(h);
      return acc;
  }, {});
  const sessionList = Object.keys(groupedHistory).sort((a,b) => b.localeCompare(a)); 
  
  const filteredSessionList = sessionList.filter(sId => {
      if (!historySearch.trim()) return true;
      const firstQ = groupedHistory[sId][0];
      const title = firstQ.session_title || firstQ.query;
      return title.toLowerCase().includes(historySearch.toLowerCase());
  });

  if (!employeeId) return <div className="flex-1 flex items-center justify-center p-8"><TypingIndicator /></div>;

  return (
    <div className="flex flex-1 overflow-hidden w-full h-full relative">
      
      {/* PERSISTENT LEFT SIDEBAR (History + Library) */}
      <div className="flex flex-col w-72 bg-dark-800 border-r border-white/10 shrink-0 h-full">
        <div className="flex items-center gap-1 p-2 border-b border-white/10 select-none">
           <button 
             onClick={()=>setLeftTab('history')} 
             className={`flex-1 py-2 text-[11px] font-medium rounded text-center transition-colors ${leftTab==='history' ? 'bg-brand-600/20 text-brand-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'}`}
           >
             <History className="w-3.5 h-3.5 inline mr-1.5"/>Past Chats
           </button>
           <button 
             onClick={()=>setLeftTab('library')} 
             className={`flex-1 py-2 text-[11px] font-medium rounded text-center transition-colors ${leftTab==='library' ? 'bg-brand-600/20 text-brand-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'}`}
           >
             <FileText className="w-3.5 h-3.5 inline mr-1.5"/>Library
           </button>
        </div>

        {leftTab === 'history' && (
          <>
            <div className="p-3 shrink-0 border-b border-white/10 space-y-2">
              <button onClick={handleReset} className="btn-primary w-full flex items-center justify-center gap-2 py-2 text-[11px]">
                 <MessageSquare className="w-3.5 h-3.5" /> Start New Chat
              </button>
              <input 
                 type="text"
                 placeholder="Search history..."
                 value={historySearch}
                 onChange={e => setHistorySearch(e.target.value)}
                 className="input-field text-[11px] py-1.5 px-2 w-full bg-dark-900 border-white/5 placeholder-slate-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {filteredSessionList.length === 0 ? <p className="text-[11px] text-slate-500 text-center mt-5">No saved chats found.</p> : 
                filteredSessionList.map(sId => {
                  const qs = groupedHistory[sId];
                  const firstQ = qs[0];
                  return (
                  <div 
                      key={sId} 
                      className={`p-2.5 rounded-lg text-sm border flex flex-col gap-1.5 transition-colors group relative ${sessionId === sId ? 'bg-dark-600/80 border-brand-500/30' : 'bg-dark-500/30 border-white/5 hover:bg-dark-400/80'}`}
                  >
                    <div className="flex justify-between items-center pb-1">
                      <span className="text-[9px] text-slate-500">{new Date(firstQ.created_at).toLocaleDateString()}</span>
                      <span className="text-[9px] text-slate-500 px-1 bg-dark-700 rounded">{qs.length} msgs</span>
                    </div>
                    {editingSessionId === sId ? (
                        <div className="flex items-center gap-1 z-10">
                           <input 
                              type="text" 
                              autoFocus
                              value={editingSessionTitle} 
                              onChange={e => setEditingSessionTitle(e.target.value)} 
                              onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(sId) }}
                              className="input-field text-[11px] py-1 px-1.5 w-full bg-dark-800"
                           />
                           <button onClick={() => handleRenameSubmit(sId)} className="text-emerald-400 p-1 bg-dark-600 rounded"><Check className="w-3 h-3"/></button>
                           <button onClick={() => setEditingSessionId(null)} className="text-slate-400 p-1 bg-dark-600 rounded"><X className="w-3 h-3"/></button>
                        </div>
                    ) : (
                        <div className="flex items-start justify-between gap-2 text-slate-200 cursor-pointer" onClick={() => {
                           const restoredMsgs = [
                              { id: "intro_"+sId, role: 'assistant', content: `Continuing chat... loaded previous context.`, time: '', active_agent: 'Done' }
                           ];
                           qs.forEach((h) => {
                               restoredMsgs.push({ id: h.id + "_u", role: 'user', content: h.query, time: new Date(h.created_at).toLocaleTimeString() });
                               restoredMsgs.push({ id: h.id + "_a", role: 'assistant', content: h.response, time: new Date(h.created_at).toLocaleTimeString(), active_agent: 'Done', hallucination_check: 'pass' });
                           });
                           setSessionId(sId);
                           setSaveChat(true); 
                           setMessages(restoredMsgs);
                           setTimeout(() => inputRef.current?.focus(), 100);
                        }}>
                          <p className="text-[11px] leading-relaxed line-clamp-2 pr-4">{firstQ.session_title || firstQ.query}</p>
                          <button onClick={(e) => { e.stopPropagation(); setEditingSessionTitle(firstQ.session_title || firstQ.query); setEditingSessionId(sId); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-brand-300 transition-opacity rounded absolute right-1"><Edit2 className="w-3 h-3"/></button>
                        </div>
                    )}
                  </div>
                )})
              }
            </div>
          </>
        )}

        {leftTab === 'library' && (
           <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <p className="text-[10px] text-slate-400 mb-4 px-1 leading-relaxed">These are the original policy PDFs uploaded by Admins. You can download them to read the full context.</p>
              {libraryDocs.length === 0 ? <p className="text-[11px] text-slate-500 text-center mt-5">No documents in library.</p> : 
                libraryDocs.map(doc => (
                  <a key={doc.id} href={`http://127.0.0.1:8000/download/${doc.filename}`} target="_blank" rel="noreferrer" 
                     className="flex items-center gap-2 p-2 rounded-lg bg-dark-500/30 hover:bg-dark-400/80 border border-white/5 transition-colors group"
                     title={`Download ${doc.filename}`}>
                     <FileText className="w-4 h-4 text-emerald-400/70" />
                     <span className="text-[11px] text-slate-300 truncate flex-1">{doc.filename}</span>
                     <DownloadCloud className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                  </a>
                ))
              }
           </div>
        )}
      </div>

      {/* CHAT INTERFACE */}
      <div className="flex flex-col flex-1 min-w-0 h-full relative">
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-dark-900/50 z-10 sticky top-0 shrink-0">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-brand-400" />
            <div>
              <h1 className="font-semibold text-white text-sm">SDF AI Agent</h1>
              <p className="text-[11px] text-slate-500">Responses are generated from internal documents only.</p>
            </div>
          </div>
        </header>

        <AgentPipeline activeAgent={activeAgentNav} />

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
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

        <div className="px-6 py-4 border-t border-white/10 bg-dark-900/80 backdrop-blur-md shrink-0">
          <form onSubmit={handleSend} className="flex items-center gap-3 w-full">
            <input ref={inputRef} id="chat-input" type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder={hint} disabled={loading} className="input-field flex-1 text-sm py-3" />
            <div className="flex flex-col items-center justify-center shrink-0">
              <button id="send-btn" type="submit" disabled={loading || !query.trim()} className="btn-primary w-24 h-11 flex items-center justify-center gap-2"><Send className="w-4 h-4" /> Send</button>
            </div>
          </form>
          <div className="flex items-center justify-between mt-2.5">
             <p className="text-[10px] text-slate-600">Generated content is audited for accuracy.</p>
             <label className="flex items-center gap-2 cursor-pointer group" title="Turn ON to save this chat to Past Chats">
               <div className="relative">
                 <input type="checkbox" className="sr-only peer" checked={saveChat} onChange={e => handleToggleSave(e.target.checked)} />
                 <div className={`block w-8 h-4 rounded-full transition-colors ${saveChat ? 'bg-emerald-500' : 'bg-dark-600 border border-white/10 group-hover:border-white/20'}`}></div>
                 <div className={`absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform ${saveChat ? 'translate-x-4 shadow-sm' : 'translate-x-0 bg-slate-400'}`}></div>
               </div>
               <span className={`text-[10px] font-medium transition-colors ${saveChat ? 'text-emerald-400' : 'text-slate-400'}`}>
                 {saveChat ? 'Chat History Saving: ON' : 'Chat History Saving: OFF'}
               </span>
             </label>
          </div>
        </div>
      </div>
      
    </div>
  );
}
