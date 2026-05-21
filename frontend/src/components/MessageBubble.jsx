/**
 * Chat message bubble – handles both user and AI messages.
 */
import { useState, useRef, useEffect } from 'react';
import { User, Bot, ShieldCheck, AlertTriangle, Download, Activity, Save, X } from 'lucide-react';
import { API_URL } from '../api';
/** Typing indicator shown while waiting for the AI */
export function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 animate-fade-in">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-600/20 border border-brand-500/30 flex-shrink-0">
        <Bot className="w-4 h-4 text-brand-400" />
      </div>
      <div className="glass-card px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="ml-2 text-xs text-slate-500">Preparing agents…</span>
        </div>
      </div>
    </div>
  );
}

export default function MessageBubble({ message, onEditSubmit }) {
  const isUser = message.role === 'user';
  
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const inputRef = useRef(null);

  useEffect(() => {
     if (isEditing) {
         inputRef.current?.focus();
     }
  }, [isEditing]);

  const handleSave = () => {
      const q = editValue.trim();
      if (q && q !== message.content) {
          onEditSubmit?.(q, message.id);
      }
      setIsEditing(false);
  };

  if (isUser) {
    return (
      <div className="flex items-end justify-end gap-3 w-full animate-slide-up group">
        <div className="max-w-[72%] relative">
          <div className="bg-brand-600/30 border border-brand-500/30 rounded-2xl rounded-br-sm px-4 py-3">
            {isEditing ? (
               <div className="flex flex-col gap-2">
                 <textarea 
                    ref={inputRef}
                    value={editValue} 
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); } }}
                    className="w-full bg-dark-700/50 text-white text-base border border-brand-500/50 rounded p-2 focus:outline-none focus:ring-1 focus:ring-brand-400 min-w-[250px] resize-none"
                    rows={Math.max(1, editValue.split('\n').length)}
                 />
                 <div className="flex items-center justify-end gap-2">
                    <button onClick={() => { setIsEditing(false); setEditValue(message.content); }} className="px-2 py-1 bg-dark-600 hover:bg-dark-500 text-slate-300 text-[10px] rounded transition-colors">Cancel</button>
                    <button onClick={handleSave} className="px-2 py-1 bg-brand-600 hover:bg-brand-500 text-white text-[10px] rounded transition-colors font-medium">Save & Submit</button>
                 </div>
               </div>
            ) : (
               <p className="text-slate-100 text-base leading-relaxed whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
          {!isEditing && (
              <div className="flex justify-between items-center mt-1 px-1">
                 <button onClick={() => setIsEditing(true)} className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-brand-300 hover:text-brand-200 bg-brand-900/30 px-2 py-0.5 rounded cursor-pointer">
                   Edit
                 </button>
                 <p className="text-right text-[11px] text-slate-600">{message.time}</p>
              </div>
          )}
        </div>
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 border border-white/10 flex-shrink-0">
          <User className="w-4 h-4 text-slate-300" />
        </div>
      </div>
    );
  }

  /* AI message */
  const isPass = message.hallucination_check === 'pass';
  const hasMeta = !!message.hallucination_check;
  const isWorking = message.active_agent && message.active_agent !== 'Done';

  // Extract and format citations to render at the bottom
  const citationRegex = /\[Source:\s*([^,\]]+)(?:,\s*Page:\s*(\d+))?(?:,\s*(?:Paragraph|Paragraph\/Chunk|Chunk):\s*(\d+))?\]/gi;
  let rawContent = message.content || '';
  
  const groupedReferences = {};
  
  let formattedContent = rawContent.replace(citationRegex, (match, file, page, para) => {
      const f = file.trim();
      if (!groupedReferences[f]) {
          groupedReferences[f] = { file: f, pages: new Set(), paras: new Set() };
      }
      if (page) groupedReferences[f].pages.add(page);
      if (para) groupedReferences[f].paras.add(para);
      return ''; // Strip the blocky inline citations
  });
  
  // Format the remaining text as basic markdown/linebreaks
  formattedContent = formattedContent.replace(/\n/g, '<br />');

  const references = Object.values(groupedReferences);

  return (
    <div className="flex items-end gap-3 animate-slide-up">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-600/20 border border-brand-500/30 flex-shrink-0">
        <Bot className="w-4 h-4 text-brand-400" />
      </div>
      <div className="max-w-[78%]">
        <div className="glass-card px-4 py-3.5">
          {isWorking && (
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5 text-[11px] text-brand-300">
               <Activity className="w-3.5 h-3.5 animate-pulse" /> Agent actively working: <span className="font-semibold px-1.5 py-0.5 bg-brand-900/40 rounded">{message.active_agent}</span>
               <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </div>
          )}

          <div
            className="text-base text-slate-200 leading-relaxed ai-prose"
            dangerouslySetInnerHTML={{ __html: formattedContent || '...' }}
          />

          {/* References Block per User Request */}
          {references.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
              <p className="text-[10px] text-slate-500 font-semibold mb-1">Sources Reference:</p>
              <ul className="flex flex-col gap-1.5 list-disc list-inside">
                 {references.map((r, idx) => {
                   const pagesStr = r.pages.size > 0 ? `(Pages: ${Array.from(r.pages).join(', ')})` : '';
                   return (
                     <li key={idx} className="text-xs text-slate-400">
                        <a href={`${API_URL}/download/${encodeURIComponent(r.file)}`} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 hover:underline transition inline-flex items-center gap-1 font-medium">
                          📄 {r.file}
                        </a>
                        {pagesStr && <span className="ml-1.5 text-[10px] opacity-70 tracking-wide">{pagesStr}</span>}
                     </li>
                   );
                 })}
              </ul>
            </div>
          )}

          {/* Audit meta row */}
          {hasMeta && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/10">
              <span className={`badge ${isPass ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/40' : 'bg-amber-900/50 text-amber-300 border border-amber-700/40'}`}>
                {isPass
                  ? <><ShieldCheck className="w-3 h-3" /> Verified {message.accuracy_score && `(${message.accuracy_score})`}</>
                  : <><AlertTriangle className="w-3 h-3" /> Unverified</>
                }
              </span>
              {message.rewrite_count > 0 && (
                <span className="badge bg-brand-900/50 text-brand-300 border border-brand-700/40">
                  {message.rewrite_count} rewrite{message.rewrite_count > 1 ? 's' : ''}
                </span>
              )}
              {message.active_agent === 'CacheHit' && (
                <span className="badge bg-indigo-900/50 text-indigo-300 border border-indigo-700/40">⚡ Cache Hit</span>
              )}
              <span className="ml-auto text-[11px] text-slate-600">{message.time}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

