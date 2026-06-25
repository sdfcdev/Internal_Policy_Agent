/**
 * Chat message bubble – handles both user and AI messages.
 */
import { useState, useRef, useEffect } from 'react';
import { User, Bot, ShieldCheck, AlertTriangle, Download, Activity, Save, X, Copy, Check } from 'lucide-react';
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

export default function MessageBubble({ message, onEditSubmit, textSize = 'md', userBubbleColor = 'blue', aiBubbleColor = 'white' }) {
  const isUser = message.role === 'user';
  
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  const handleCopy = () => {
      const text = message.content;
      if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text);
      } else {
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = "fixed";
          textArea.style.left = "-999999px";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          try { document.execCommand('copy'); } catch (err) { console.error('Fallback copy failed', err); }
          document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

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

  const textSizeClass = textSize === 'sm' ? 'text-sm' : textSize === 'lg' ? 'text-lg' : 'text-base';
  const userBgClass = 
      userBubbleColor === 'emerald' ? 'bg-emerald-600/30 border-emerald-500/30' :
      userBubbleColor === 'violet' ? 'bg-violet-600/30 border-violet-500/30' :
      userBubbleColor === 'teal' ? 'bg-teal-600/30 border-teal-500/30' :
      userBubbleColor === 'orange' ? 'bg-orange-600/30 border-orange-500/30' :
      userBubbleColor === 'fuchsia' ? 'bg-fuchsia-600/30 border-fuchsia-500/30' :
      'bg-brand-600/30 border-brand-500/30'; // blue default

  const aiBgClass = 
      aiBubbleColor === 'slate' ? 'bg-slate-800/80 border border-slate-700/50' :
      aiBubbleColor === 'indigo' ? 'bg-indigo-900/40 border border-indigo-500/30' :
      aiBubbleColor === 'zinc' ? 'bg-zinc-800/80 border border-zinc-700/50' :
      aiBubbleColor === 'stone' ? 'bg-stone-800/80 border border-stone-700/50' :
      aiBubbleColor === 'neutral' ? 'bg-neutral-800/80 border border-neutral-700/50' :
      'glass-card'; // white default

  if (isUser) {
    return (
      <div className="flex items-end justify-end gap-3 w-full animate-slide-up group">
        <div className="max-w-[72%] relative">
          <div className={`${userBgClass} border rounded-2xl rounded-br-sm px-4 py-3`}>
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
               <p className={`text-slate-100 leading-relaxed whitespace-pre-wrap ${textSizeClass}`}>{message.content}</p>
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
  // Updated regex to capture multiple pages like "Page: 6, 8, 9"
  const citationRegex = /\[Source:\s*([^,\]]+)(?:,\s*Page:\s*([^\]]+))?\]/gi;
  let rawContent = message.content || '';
  
  const groupedReferences = {};
  
  let formattedContent = rawContent.replace(citationRegex, (match, file, pageStr) => {
      const f = file.trim();
      if (!groupedReferences[f]) {
          groupedReferences[f] = { file: f, pages: new Set() };
      }
      
      // If there are pages like "6, 8, 9" or "6", split and add them
      if (pageStr) {
          pageStr.split(',').forEach(p => {
              const cleanedPage = p.trim();
              if (cleanedPage && cleanedPage !== '?') {
                  groupedReferences[f].pages.add(cleanedPage);
              }
          });
      }
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
        <div className={`${aiBgClass} rounded-2xl rounded-bl-sm px-4 py-3.5 shadow-xl`}>
          {isWorking && (
             <div className="flex items-center gap-2 mb-3 px-2 py-1 bg-brand-900/20 rounded-md w-max border border-brand-500/20">
                <Activity className="w-3.5 h-3.5 text-brand-400 animate-pulse" />
                <span className="text-[11px] font-medium text-brand-300">Agent {message.active_agent} is working...</span>
             </div>
          )}

          <div
            className={`text-slate-200 leading-relaxed ai-prose ${textSizeClass === 'text-sm' ? 'text-sm' : textSizeClass === 'text-lg' ? 'text-lg' : 'text-base'}`}
            dangerouslySetInnerHTML={{ __html: formattedContent || '...' }}
          />

          {/* References Block */}
          {references.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">📎 Sources Reference</p>
              <ul className="flex flex-col gap-1.5">
                 {references.map((r, idx) => {
                   const pagesStr = r.pages.size > 0 ? `(Pages: ${Array.from(r.pages).join(', ')})` : '';
                   return (
                     <li key={idx} className="flex items-center gap-2 bg-brand-950/30 border border-brand-800/30 rounded-lg px-3 py-1.5">
                        <a href={`${API_URL}/uploads/${encodeURIComponent(r.file)}`} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 hover:underline transition inline-flex items-center gap-1.5 font-medium text-xs">
                          {r.file}
                        </a>
                        {pagesStr && <span className="ml-auto text-[10px] text-slate-500 tracking-wide bg-dark-700/60 px-2 py-0.5 rounded-full">{pagesStr}</span>}
                     </li>
                   );
                 })}
              </ul>
            </div>
          )}

          {/* Meta and Copy Footer */}
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-2.5 border-t border-white/10">

            <div className="ml-auto flex items-center gap-3">
              <button 
                onClick={handleCopy}
                className={`p-1.5 rounded transition-all flex items-center justify-center ${copied ? 'text-brand-400 bg-brand-500/10' : 'text-slate-500 hover:text-brand-300 hover:bg-white/5'}`}
                title={copied ? "Copied!" : "Copy answer"}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <span className="text-[11px] text-slate-600">{message.time}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

