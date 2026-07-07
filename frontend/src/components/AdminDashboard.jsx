import { useState, useRef, useCallback, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle2, XCircle, Loader2, Trash2, List, AlignLeft, Edit, Save, Users, PlusCircle, ChevronDown, ChevronUp, Download, Brain, Search, Info, Cpu } from 'lucide-react';
import { uploadPdf, getDocumentCount, getAdminLogs, getChunks, deleteDocument, renameDocument, updateDocument, getAccounts, addAccount, deleteAccount, updateAccount, getDocuments, getIntelligenceAudit } from '../api';

function fileSizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AdminDashboard({ user, role }) {
  // Toast notification state
  const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' }
  const toastTimer = useRef(null);

  function showToast(message, type = 'success') {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading]       = useState(false);
  const [progress, setProgress]         = useState(0);
  const [result, setResult]             = useState(null);
  const [error, setError]               = useState('');
  const [dragging, setDragging]         = useState(false);
  
  const [docCount, setDocCount]         = useState(null);
  const [logs, setLogs]                 = useState([]);
  const [chunks, setChunks]             = useState([]);
  const [documents, setDocuments]       = useState([]);
  const [accounts, setAccounts]       = useState([]);
  const [loadingData, setLoadingData]   = useState(false);
  
  // AI Intelligence Audit State
  const [logView, setLogView] = useState('document'); // 'document' | 'intelligence'
  const [intelLogs, setIntelLogs] = useState([]);
  const [intelSearch, setIntelSearch] = useState(''); // 'all' | '1' | '2' | '3' | 'gt1' | 'gt2'

  // New Admin fields
  const [startDate, setStartDate]       = useState('');
  const [expireDate, setExpireDate]     = useState('');
  const [department, setDepartment]     = useState('General');
  const [allowedEmails, setAllowedEmails] = useState('');
  const [allowedGroups, setAllowedGroups] = useState([]);

  // Editing state
  const [editingDoc, setEditingDoc]     = useState(null);
  const [editFilename, setEditFilename] = useState('');
  const [editStart, setEditStart]       = useState('');
  const [editExpire, setEditExpire]     = useState('');
  const [editDepartment, setEditDepartment] = useState('General');
  const [editAllowedEmails, setEditAllowedEmails] = useState('');
  const [editAllowedGroups, setEditAllowedGroups] = useState([]);
  
  const [showUploadAccess, setShowUploadAccess] = useState(false);
  const [showEditAccess, setShowEditAccess] = useState(false);

  const accessGroupsList = [
    'ALL', 'CEO', 'COO', 'DIRECTORS', 'MANCOM', 'JUNIOR MANCOM', 
    'SECRETARY TO CHAIRMAN', 'SECRETARY TO CEO', 'COMPANY SECRETARY',
    'AUDIT', 'COMPLIANCE', 'CREDIT', 'CREDIT ADMINISTRATION UNIT', 
    'FINANCE', 'GOLD LOAN', 'HR', 'IT', 'LEGAL', 'MARKETING', 
    'OPERATIONS AND ADMINISTRATION', 'RECOVERY', 'RISK MANAGEMENT', 
    'STRATEGIC PLANNING'
  ];

  // Department filter for documents list
  const [docFilterDept, setDocFilterDept] = useState('All');

  // Expand state for chunks
  const [expandedDocs, setExpandedDocs] = useState({});

  // Account form state
  const [accPassword, setAccPassword] = useState('');
  const [accRole, setAccRole] = useState('user');
  const [accName, setAccName] = useState('');
  const [accEmpNum, setAccEmpNum] = useState('');
  const [accDepartment, setAccDepartment] = useState('');

  // Account editing state
  const [editingAcc, setEditingAcc] = useState(null);
  const [editAccRole, setEditAccRole] = useState('');
  const [editAccName, setEditAccName] = useState('');
  const [editAccPreferredName, setEditAccPreferredName] = useState('');
  const [editAccEmpNum, setEditAccEmpNum] = useState('');
  const [editAccDepartment, setEditAccDepartment] = useState('');
  const [editAccPassword, setEditAccPassword] = useState('');
  const [accSearch, setAccSearch] = useState('');

  const fileInputRef = useRef(null);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      // Fetch each piece of data independently
      try {
        const c = await getDocumentCount();
        setDocCount(c.total_chunks);
      } catch (e) { console.error("Count fetch failed", e); }

      try {
        const l = await getAdminLogs();
        setLogs(l || []);
      } catch (e) { console.error("Logs fetch failed", e); }

      try {
        const ch = await getChunks();
        setChunks(ch?.chunks || []);
      } catch (e) { console.error("Chunks fetch failed", e); }

      try {
        const d = await getDocuments();
        setDocuments(d || []);
      } catch (e) { console.error("Docs fetch failed", e); }

      try {
        if (role === 'master' || role === 'admin') {
          const accs = await getAccounts();
          setAccounts(accs || []);
        }
      } catch (e) { console.error("Accounts fetch failed", e); }

      try {
        if (role === 'master') {
          const iLogs = await getIntelligenceAudit();
          setIntelLogs(iLogs || []);
        }
      } catch (e) { console.error("Intelligence Audit fetch failed", e); }

    } catch (e) {
      console.error("Dashboard global fetch error", e);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => { 
    fetchData(); 
  }, [role]); // Fetch on mount and when role changes

  const onDragOver  = useCallback(e => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(()  => setDragging(false), []);
  const onDrop      = useCallback(e => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type === 'application/pdf') pick(file);
    else setError('Only PDF files are accepted.');
  }, []);

  function pick(file) {
    setSelectedFile(file);
    setResult(null);
    setError('');
    setProgress(0);
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (file) pick(file);
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!selectedFile || uploading) return;
    
    // Validate file size (Max 15MB)
    const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB in bytes
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`File is too large (${(selectedFile.size / (1024*1024)).toFixed(1)}MB). Maximum allowed size is 15MB. Please split the document.`);
      return;
    }

    setUploading(true);
    setError('');
    setResult(null);
    setProgress(0);

    try {
      const data = await uploadPdf(selectedFile, user.username, startDate, expireDate, department, allowedEmails, allowedGroups.join(','), pct => setProgress(pct));
      setResult(data);
      setSelectedFile(null);
      setStartDate('');
      setExpireDate('');
      setDepartment('General');
      setAllowedEmails('');
      setAllowedGroups([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchData(); // Refresh UI
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Upload failed.';
      setError(detail);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(filename) {
    if(!confirm(`Are you sure you want to delete chunks for ${filename}?`)) return;
    setLoadingData(true);
    try {
      await deleteDocument(filename, user.username);
      showToast(`"${filename}" deleted successfully.`, 'success');
      await fetchData();
    } catch (e) {
      showToast("Failed to delete document: " + e.message, 'error');
    }
    setLoadingData(false);
  }

  async function handleSaveDoc(doc) {
    setLoadingData(true);
    try {
      if (doc.filename !== editFilename) {
          await renameDocument(doc.filename, editFilename, user.username);
      }
      await updateDocument(editFilename, editStart, editExpire, editDepartment, editAllowedEmails, editAllowedGroups.join(','), user.username);
      setEditingDoc(null);
      showToast('Document updated successfully.', 'success');
      await fetchData();
    } catch (e) {
      showToast("Failed to update: " + e.message, 'error');
    }
    setLoadingData(false);
  }

  async function handleAddAccount(e) {
    e.preventDefault();
    try {
      await addAccount(accEmpNum, accRole, accName, accEmpNum, accDepartment, user.username);
      setAccName(''); setAccEmpNum(''); setAccDepartment('');
      showToast(`Account "${accEmpNum}" created successfully.`, 'success');
      await fetchData();
    } catch (e) {
      showToast("Failed to add account: " + (e.response?.data?.detail || e.message), 'error');
    }
  }

  async function handleDeleteAccount(username) {
    if(!confirm(`Delete account for ${username}?`)) return;
    try {
      await deleteAccount(username, user.username);
      showToast(`Account "${username}" deleted.`, 'success');
      await fetchData();
    } catch (e) {
      showToast("Failed to delete account: " + e.message, 'error');
    }
  }

  async function handleUpdateAccount(username) {
    try {
      await updateAccount(username, editAccRole, editAccName, editAccPreferredName, editAccEmpNum, editAccDepartment, editAccPassword, user.username);
      setEditingAcc(null);
      showToast(`Account "${username}" updated successfully.`, 'success');
      await fetchData();
    } catch (e) {
      showToast("Failed to update account: " + (e.response?.data?.detail || e.message), 'error');
    }
  }

  const toggleDocExpand = (id) => {
      setExpandedDocs(prev => ({...prev, [id]: !prev[id]}));
  };

  const downloadLogsPDF = async () => {
    try {
        const isIntel = logView === 'intelligence';
        if (!window.jspdf) {
            await new Promise((resolve) => {
               const script = document.createElement("script");
               script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
               script.onload = resolve;
               document.head.appendChild(script);
            });
            await new Promise((resolve) => {
               const script2 = document.createElement("script");
               script2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js";
               script2.onload = resolve;
               document.head.appendChild(script2);
            });
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(16);
        doc.text(isIntel ? "SDF Admin - AI Intelligence Audit Report" : "SDF Admin - Document Management Logs", 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);

        let columns, rows, headerColor;
        
        if (isIntel) {
          const filtered = intelLogs.filter(l => {
            const matchesSearch = l.employee_id.includes(intelSearch) || l.query.toLowerCase().includes(intelSearch.toLowerCase());
            if (!matchesSearch) return false;
            if (loopFilter === 'all') return true;
            if (loopFilter === '1') return l.loops === 1;
            if (loopFilter === '2') return l.loops === 2;
            if (loopFilter === '3') return l.loops === 3;
            if (loopFilter === 'gt1') return l.loops > 1;
            if (loopFilter === 'gt2') return l.loops > 2;
            return true;
          });

          columns = ["User", "Query", "Retries", "Model", "Timestamp"];
          rows = filtered.map(l => [
            l.employee_id,
            l.query.length > 60 ? l.query.substring(0, 60) + "..." : l.query,
            l.loops,
            l.model.split('|')[0].trim(),
            new Date(l.created_at).toLocaleString()
          ]);
          headerColor = [126, 34, 206]; // Purple for Intelligence
        } else {
          columns = ["Date", "Action", "Admin / Operator", "Target (File/User)", "Info"];
          rows = logs.map(l => [
            new Date(l.created_at).toLocaleString(),
            l.action,
            l.admin_id || "System",
            l.filename,
            l.chunks_count > 0 ? `${l.chunks_count} chunks` : "-"
          ]);
          headerColor = [79, 70, 229]; // Brand color for Documents
        }

        doc.autoTable({
          head: [columns],
          body: rows,
          startY: 35,
          styles: { fontSize: 8 },
          headStyles: { fillColor: headerColor },
        });

        doc.save(isIntel ? `AI_Intelligence_Audit_${Date.now()}.pdf` : `SDF_Admin_Logs_${Date.now()}.pdf`);
    } catch(e) {
        showToast("Failed to generate PDF. Make sure you have internet access for the library.", 'error');
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-y-auto w-full">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[9999] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border backdrop-blur-md transition-all duration-300 animate-fade-in ${
          toast.type === 'success' 
            ? 'bg-emerald-900/80 border-emerald-500/40 text-emerald-200' 
            : 'bg-red-900/80 border-red-500/40 text-red-200'
        }`}>
          {toast.type === 'success' 
            ? <CheckCircle2 size={18} className="text-emerald-400 shrink-0" /> 
            : <XCircle size={18} className="text-red-400 shrink-0" />
          }
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-white/40 hover:text-white transition">✕</button>
        </div>
      )}


      <div className="p-8 grid gap-8 w-full max-w-full">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start w-full">
          {/* UPLOAD SECTION */}
          <div className="glass-card p-6 flex flex-col h-full w-full">
            <h2 className="text-base font-semibold text-white mb-1">Upload Policy Document</h2>
            <p className="text-xs text-slate-500 mb-5">PDF will be chunked and indexed automatically.</p>

            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => !selectedFile && fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl px-6 py-10 cursor-pointer transition-all duration-200 ${dragging ? 'border-brand-500 bg-brand-600/10' : selectedFile ? 'border-emerald-600/50 bg-emerald-900/10 cursor-default' : 'border-white/15 hover:border-brand-600/50 hover:bg-brand-600/5'}`}
            >
              <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={onFileChange} className="hidden" />
              {selectedFile ? (
                <>
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-900/30 border border-emerald-600/30"><FileText className="w-6 h-6 text-emerald-400" /></div>
                  <div className="text-center">
                    <p className="font-medium text-slate-200 text-sm break-all">{selectedFile.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{fileSizeLabel(selectedFile.size)}</p>
                  </div>
                  <button type="button" onClick={e => { e.stopPropagation(); setSelectedFile(null); setError(''); }} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /> Remove</button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-brand-600/15 border border-brand-500/25"><UploadCloud className="w-6 h-6 text-brand-400" /></div>
                  <div className="text-center">
                    <p className="text-sm text-slate-300"><span className="text-brand-400 font-medium">Click to browse</span> or drag & drop</p>
                    <p className="text-xs text-slate-600 mt-0.5">PDF files only</p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 space-y-4 w-full">
               <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field py-1.5 px-3 text-xs w-full"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-1">Expire Date</label>
                    <input type="date" value={expireDate} onChange={e => setExpireDate(e.target.value)} className="input-field py-1.5 px-3 text-xs w-full"/>
                  </div>
               </div>
               <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">Target Department</label>
                    <select 
                      value={department} 
                      onChange={e => setDepartment(e.target.value)} 
                      className="input-field py-1.5 px-3 text-xs w-full bg-dark-900 border-white/5"
                    >
                      <option value="General">General / Other</option>
                      <option value="RESTRICTED / PRIVATE">RESTRICTED / PRIVATE (Emails only)</option>
                      <option value="AUDIT">AUDIT</option>
                      <option value="CBSL DIRECTIONS">CBSL DIRECTIONS</option>
                      <option value="COMPLIANCE">COMPLIANCE</option>
                      <option value="CREDIT">CREDIT</option>
                      <option value="CREDIT ADMINISTRATION UNIT">CREDIT ADMINISTRATION UNIT</option>
                      <option value="FINANCE">FINANCE</option>
                      <option value="GOLD LOAN">GOLD LOAN</option>
                      <option value="HR">HR</option>
                      <option value="IT">IT</option>
                      <option value="LEGAL">LEGAL</option>
                      <option value="MARKETING">MARKETING</option>
                      <option value="OPERATIONS AND ADMINISTRATION">OPERATIONS AND ADMINISTRATION</option>
                      <option value="RECOVERY">RECOVERY</option>
                      <option value="RISK MANAGEMENT">RISK MANAGEMENT</option>
                      <option value="STRATEGIC PLANNING">STRATEGIC PLANNING</option>
                      <option value="COMPANY SECRETARY">COMPANY SECRETARY</option>
                      <option value="SECRETARY TO CHAIRMAN">SECRETARY TO CHAIRMAN</option>
                      <option value="MANCOM">MANCOM</option>
                      <option value="CEO">CEO</option>
                    </select>
               </div>
               <div className="w-full">
                 <button 
                   onClick={() => setShowUploadAccess(!showUploadAccess)}
                   className="flex items-center justify-between w-full input-field py-1.5 px-3 text-xs bg-dark-900 border-white/5 text-slate-400"
                 >
                   <span>Access Control (Who can view this?) {allowedGroups.length > 0 ? `(${allowedGroups.length} selected)` : ''}</span>
                   {showUploadAccess ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                 </button>
                 
                 {showUploadAccess && (
                   <div className="mt-2 grid grid-cols-2 gap-2 bg-dark-900/50 border border-white/10 p-3 rounded-xl max-h-[250px] overflow-y-auto shadow-inner">
                      {accessGroupsList.map(group => {
                         const isSelected = allowedGroups.includes(group);
                         return (
                         <label key={group} className="flex items-center gap-2.5 cursor-pointer p-1.5 hover:bg-white/5 rounded-lg transition-colors">
                            <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
                               <input 
                                 type="checkbox" 
                                 className="peer appearance-none w-4 h-4 bg-slate-800/80 border border-slate-600 rounded cursor-pointer checked:bg-brand-500 checked:border-brand-500 transition-all"
                                 checked={isSelected}
                                 onChange={(e) => {
                                    if (e.target.checked) setAllowedGroups([...allowedGroups, group]);
                                    else setAllowedGroups(allowedGroups.filter(g => g !== group));
                                 }}
                               />
                               <div className="pointer-events-none absolute opacity-0 peer-checked:opacity-100 text-white drop-shadow-sm">
                                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                               </div>
                            </div>
                            <span className={`text-[11px] font-medium transition-colors ${isSelected ? 'text-brand-300' : 'text-slate-300'}`}>{group}</span>
                         </label>
                      )})}
                   </div>
                 )}
               </div>
               <div>
                 <label className="block text-[10px] font-medium text-slate-400 mb-1">Allowed Emails (Comma separated, optional)</label>
                 <input type="text" placeholder="e.g. kasun@sdf.lk, nimal@sdf.lk" value={allowedEmails} onChange={e => setAllowedEmails(e.target.value)} className="input-field py-1.5 px-3 text-xs w-full bg-dark-900 border-white/5"/>
               </div>
            </div>

            {uploading && (
              <div className="mt-4"><div className="flex justify-between text-xs text-slate-500 mb-1.5"><span>Uploading…</span><span>{progress}%</span></div><div className="w-full bg-dark-500 rounded-full h-1.5"><div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${progress}%` }} /></div></div>
            )}
            {error && <div className="mt-4 flex items-start gap-2.5 glass-card border-red-500/30 bg-red-900/10 px-4 py-3"><XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" /><p className="text-sm text-red-400 break-words">{error}</p></div>}
            {result && <div className="mt-4 flex items-start gap-2.5 glass-card border-emerald-500/30 bg-emerald-900/10 px-4 py-3"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /><div><p className="text-sm font-semibold text-emerald-300 break-words">{result.message}</p></div></div>}

            <button onClick={handleUpload} disabled={!selectedFile || uploading} className="btn-primary w-full mt-auto mt-4 flex items-center justify-center gap-2 shrink-0">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <><UploadCloud className="w-4 h-4" /> Upload Document</>}
            </button>
          </div>

          <div className="glass-card p-6 flex flex-col h-full max-h-[650px] w-full relative overflow-hidden">
             <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-brand-600/10 border border-brand-500/20">
                     {logView === 'document' ? <List className="w-5 h-5 text-brand-400"/> : <Brain className="w-5 h-5 text-purple-400"/>}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white uppercase tracking-tight">
                      {logView === 'document' ? 'Document Action Logs' : 'AI Intelligence Audit'}
                    </h2>
                    <p className="text-[10px] text-slate-500 font-medium tracking-wide">
                      {logView === 'document' ? 'Tracking file operations and system changes' : 'Evaluating AI reasoning and hallucination corrections'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                   {/* Switch View Button (Master Admin Only) */}
                   {role === 'master' && (
                     <button 
                       onClick={() => setLogView(logView === 'document' ? 'intelligence' : 'document')}
                       className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide transition-all border ${
                         logView === 'document' 
                           ? 'bg-purple-600/10 text-purple-400 border-purple-500/30 hover:bg-purple-600 hover:text-white' 
                           : 'bg-brand-600/10 text-brand-400 border-brand-500/30 hover:bg-brand-600 hover:text-white'
                       }`}
                     >
                        {logView === 'document' ? 'Switch to Intelligence' : 'Back to Document Logs'}
                     </button>
                   )}
                   <button onClick={downloadLogsPDF} className="flex items-center gap-1.5 bg-dark-600 hover:bg-brand-600/50 text-slate-300 text-[10px] px-2.5 py-1.5 rounded-xl transition border border-white/5">
                      <Download className="w-3.5 h-3.5" /> PDF
                   </button>
                </div>
             </div>

             {/* Search and Filter for Intelligence Audit */}
             {logView === 'intelligence' && (
                <div className="flex flex-col sm:flex-row gap-3 mb-4 shrink-0">
                   <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                      <input 
                        type="text"
                        placeholder="Search by Employee ID or Query..."
                        value={intelSearch}
                        onChange={e => setIntelSearch(e.target.value)}
                        className="input-field w-full pl-9 py-2 text-xs bg-dark-900/50 border-white/5"
                      />
                   </div>
                </div>
             )}

            <div className="flex-1 overflow-y-auto pr-2 space-y-3 w-full custom-scrollbar">
              {logView === 'document' ? (
                logs.length === 0 ? <p className="text-sm text-slate-500 text-center mt-10 italic">No actions recorded yet.</p> : 
                logs.map(log => (
                  <div key={log.id} className="flex flex-col gap-1 text-sm bg-dark-500/50 p-3 rounded-xl border border-white/5 w-full hover:border-brand-500/30 transition-all group">
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-md ${
                        log.action.startsWith('USER_') ? 'bg-indigo-900/40 text-indigo-400' : 
                        log.action === 'UPLOAD' ? 'bg-emerald-900/40 text-emerald-400' : 
                        log.action === 'DELETE' ? 'bg-red-900/40 text-red-400' :
                        'bg-amber-900/40 text-amber-400'
                      }`}>
                        {log.action.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-600 font-mono">{log.created_at.replace('T', ' ').split('.')[0]}</span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 font-medium"><span className="text-slate-500">Actor:</span> {log.admin_id}</p>
                    <p className="text-xs text-slate-300 font-medium"><span className="text-slate-500">File:</span> {log.filename}</p>
                    {log.target && <p className="text-xs text-indigo-400 font-black mt-1 uppercase tracking-tighter"><span className="text-slate-500">Target Dept:</span> {log.target}</p>}
                  </div>
                ))
              ) : (
                intelLogs.filter(l => {
                  const matchesSearch = (l.employee_id || '').includes(intelSearch) || (l.query || '').toLowerCase().includes(intelSearch.toLowerCase());
                  if (!matchesSearch) return false;
                  return true;
                }).length === 0 ? 
                <p className="text-sm text-slate-500 text-center mt-10 italic">No matching reasoning logs found.</p> :
                intelLogs.filter(l => {
                  const matchesSearch = (l.employee_id || '').includes(intelSearch) || (l.query || '').toLowerCase().includes(intelSearch.toLowerCase());
                  if (!matchesSearch) return false;
                  return true;
                }).map(audit => (
                  <div key={audit.id} className="flex flex-col gap-3 bg-dark-500/30 p-4 rounded-2xl border border-purple-500/10 w-full hover:border-purple-500/40 transition-all group relative">
                    <div className="flex justify-between items-center">
                       <div className="flex items-center gap-2">
                          <div className="px-2 py-0.5 bg-purple-900/40 text-purple-400 text-[9px] font-black rounded-md border border-purple-500/20 uppercase tracking-widest">Reasoning Logic</div>
                          <div className="px-2 py-0.5 bg-dark-900/50 text-slate-500 text-[9px] font-bold rounded-md border border-white/5 uppercase">{audit.loops} Retries</div>
                       </div>
                       <span className="text-[10px] text-slate-600 font-mono">{audit.created_at.replace('T', ' ').split('.')[0]}</span>
                    </div>
                    
                    <div className="space-y-2">
                       <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter w-16">User:</span>
                          <span className="text-[11px] text-white font-black">{audit.employee_id}</span>
                       </div>
                       <div className="flex items-start gap-2">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter w-16 shrink-0 mt-0.5">Query:</span>
                          <p className="text-[11px] text-slate-300 leading-relaxed italic">"{audit.query}"</p>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 mt-2">
                       <details className="group/detail">
                          <summary className="flex items-center justify-between p-2 rounded-lg bg-dark-900/40 cursor-pointer hover:bg-dark-900/60 transition-colors">
                             <div className="flex items-center gap-2">
                                <Info className="w-3 h-3 text-amber-500" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Thinking Process</span>
                             </div>
                             <ChevronDown className="w-3 h-3 text-slate-600 group-open/detail:rotate-180 transition-transform" />
                          </summary>
                          <div className="p-3 space-y-4 border-l border-amber-500/20 ml-2 mt-2">
                             <div>
                                <p className="text-[9px] font-black text-amber-500 uppercase mb-1">Failed Draft</p>
                                <p className="text-[10px] text-slate-500 line-through leading-relaxed bg-red-900/5 p-2 rounded border border-red-500/5">{audit.draft}</p>
                             </div>
                             <div>
                                <p className="text-[9px] font-black text-blue-400 uppercase mb-1">Reviewer Feedback</p>
                                <p className="text-[10px] text-blue-300/80 italic leading-relaxed bg-blue-900/5 p-2 rounded border border-blue-500/10 font-medium">"{audit.feedback}"</p>
                             </div>
                             <div>
                                <p className="text-[9px] font-black text-emerald-500 uppercase mb-1">Corrected Final</p>
                                <p className="text-[10px] text-emerald-100 leading-relaxed bg-emerald-900/5 p-2 rounded border border-emerald-500/10 font-semibold">{audit.final}</p>
                             </div>
                          </div>
                       </details>
                    </div>

                    <div className="flex items-center gap-2 mt-1 pt-2 border-t border-white/5">
                       <Cpu className="w-3 h-3 text-slate-600" />
                       <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{audit.model}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ACCOUNT MANAGEMENT SECTION (MASTER/ADMIN ONLY) */}
        {(role === 'admin' || role === 'master') && (
          <div className="glass-card p-6 w-full">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5 w-full">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400"/>
                <h2 className="text-base font-semibold text-white">User & Admin Management</h2>
              </div>
              <div className="relative w-full max-w-[250px]">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                 <input 
                   type="text"
                   placeholder="Search Emp No or Name..."
                   value={accSearch}
                   onChange={e => setAccSearch(e.target.value)}
                   className="input-field w-full pl-9 py-1.5 text-xs bg-dark-900/50 border-white/5 rounded-lg"
                 />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
               <div className="col-span-1 bg-dark-800/50 p-4 rounded-xl border border-white/5 shadow-inner shrink-0">
                   <h3 className="text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1"><PlusCircle className="w-4 h-4"/> Authorize Account</h3>
                   <p className="text-[10px] text-slate-500 mb-3 italic">User will set their own password during registration.</p>
                   <form onSubmit={handleAddAccount} className="space-y-3 w-full">
                     <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Role *</label>
                        <select value={accRole} onChange={e=>setAccRole(e.target.value)} className="input-field py-1.5 px-3 text-xs w-full cursor-pointer">
                           <option value="user">User</option>
                           <option value="subadmin">Sub-Admin</option>
                           {role === 'master' && <option value="admin">Admin</option>}
                        </select>
                     </div>
                     <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Name *</label>
                        <input type="text" value={accName} onChange={e=>setAccName(e.target.value)} required className="input-field py-1.5 px-3 text-xs w-full"/>
                     </div>
                     <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Employee Number *</label>
                        <input type="text" value={accEmpNum} onChange={e=>setAccEmpNum(e.target.value)} required placeholder="e.g. EMP1234" className="input-field py-1.5 px-3 text-xs w-full"/>
                     </div>
                     <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Department</label>
                        <select value={accDepartment} onChange={e=>setAccDepartment(e.target.value)} className="input-field py-1.5 px-3 text-xs w-full">
                          <option value="">None (General Only)</option>
                          <option value="AUDIT">AUDIT</option>
                          <option value="CBSL DIRECTIONS">CBSL DIRECTIONS</option>
                          <option value="COMPLIANCE">COMPLIANCE</option>
                          <option value="CREDIT">CREDIT</option>
                          <option value="CREDIT ADMINISTRATION UNIT">CREDIT ADMINISTRATION UNIT</option>
                          <option value="FINANCE">FINANCE</option>
                          <option value="GOLD LOAN">GOLD LOAN</option>
                          <option value="HR">HR</option>
                          <option value="IT">IT</option>
                          <option value="LEGAL">LEGAL</option>
                          <option value="MARKETING">MARKETING</option>
                          <option value="OPERATIONS AND ADMINISTRATION">OPERATIONS AND ADMINISTRATION</option>
                          <option value="RECOVERY">RECOVERY</option>
                          <option value="RISK MANAGEMENT">RISK MANAGEMENT</option>
                          <option value="STRATEGIC PLANNING">STRATEGIC PLANNING</option>
                          <option value="COMPANY SECRETARY">COMPANY SECRETARY</option>
                          <option value="SECRETARY TO CHAIRMAN">SECRETARY TO CHAIRMAN</option>
                          <option value="MANCOM">MANCOM</option>
                          <option value="CEO">CEO</option>
                        </select>
                     </div>
                      <button type="submit" className="btn-primary w-full py-1.5 text-xs h-8 flex justify-center items-center">Authorize Employee</button>
                  </form>
               </div>
               <div className="col-span-2 overflow-y-auto max-h-[400px] w-full">
                  <table className="w-full text-left text-xs text-slate-300">
                     <thead className="text-[10px] uppercase text-slate-500 bg-dark-600/50 sticky top-0 z-10">
                        <tr>
                           <th className="px-3 py-2 border-b border-white/5">Username</th>
                           <th className="px-3 py-2 border-b border-white/5">Role</th>
                           <th className="px-3 py-2 border-b border-white/5">Name</th>
                           <th className="px-3 py-2 border-b border-white/5 text-right w-20">Action</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                        {accounts.filter(acc => {
                           if (!accSearch) return true;
                           const searchLower = accSearch.toLowerCase();
                           return (acc.username && acc.username.toLowerCase().includes(searchLower)) ||
                                  (acc.name && acc.name.toLowerCase().includes(searchLower));
                        }).map(acc => {
                           const isEditing = editingAcc === acc.username;
                           return (
                           <tr key={acc.id} className="hover:bg-white/5">
                              <td className="px-3 py-2 font-mono text-brand-300">
                                 {acc.username}
                                 {isEditing && <input type="text" placeholder="New Password..." value={editAccPassword} onChange={e=>setEditAccPassword(e.target.value)} className="block mt-1 input-field py-1 px-2 text-[10px] w-full"/>}
                              </td>
                              <td className="px-3 py-2">
                                {isEditing ? (
                                    <select value={editAccRole} onChange={e=>setEditAccRole(e.target.value)} className="input-field py-1 px-2 text-[10px] w-full">
                                       <option value="user">User</option>
                                       <option value="subadmin">Sub-Admin</option>
                                       {role === 'master' && <option value="admin">Admin</option>}
                                    </select>
                                ) : (
                                    <span className={`px-2 py-0.5 rounded text-[10px] ${acc.role==='admin' ? 'bg-indigo-900/50 text-indigo-400' : acc.role==='subadmin' ? 'bg-amber-900/50 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                                      {acc.role.toUpperCase()}
                                    </span>
                                )}
                              </td>
                              <td className="px-3 py-2 max-w-[200px] break-words whitespace-normal">
                                {isEditing ? (
                                    <div className="flex flex-col gap-1">
                                       <input type="text" value={editAccName} onChange={e=>setEditAccName(e.target.value)} placeholder="Full Name" className="input-field py-1 px-2 text-[10px] w-full"/>
                                       <input type="text" value={editAccPreferredName} onChange={e=>setEditAccPreferredName(e.target.value)} placeholder="Preferred Display Name" className="input-field py-1 px-2 text-[10px] w-full"/>
                                       <input type="text" value={editAccEmpNum} onChange={e=>setEditAccEmpNum(e.target.value)} placeholder="Emp Num" className="input-field py-1 px-2 text-[10px] w-full"/>
                                       <select value={editAccDepartment} onChange={e=>setEditAccDepartment(e.target.value)} className="input-field py-1 px-2 text-[10px] w-full mt-1">
                                         <option value="">None (General Only)</option>
                                         <option value="AUDIT">AUDIT</option>
                                         <option value="CBSL DIRECTIONS">CBSL DIRECTIONS</option>
                                         <option value="COMPLIANCE">COMPLIANCE</option>
                                         <option value="CREDIT">CREDIT</option>
                                         <option value="CREDIT ADMINISTRATION UNIT">CREDIT ADMINISTRATION UNIT</option>
                                         <option value="FINANCE">FINANCE</option>
                                         <option value="GOLD LOAN">GOLD LOAN</option>
                                         <option value="HR">HR</option>
                                         <option value="IT">IT</option>
                                         <option value="LEGAL">LEGAL</option>
                                         <option value="MARKETING">MARKETING</option>
                                         <option value="OPERATIONS AND ADMINISTRATION">OPERATIONS AND ADMINISTRATION</option>
                                         <option value="RECOVERY">RECOVERY</option>
                                         <option value="RISK MANAGEMENT">RISK MANAGEMENT</option>
                                         <option value="STRATEGIC PLANNING">STRATEGIC PLANNING</option>
                                         <option value="COMPANY SECRETARY">COMPANY SECRETARY</option>
                                         <option value="SECRETARY TO CHAIRMAN">SECRETARY TO CHAIRMAN</option>
                                         <option value="MANCOM">MANCOM</option>
                                         <option value="CEO">CEO</option>
                                       </select>
                                    </div>
                                ) : (
                                    <div className="flex flex-col">
                                       <span className="leading-snug">{acc.name} <span className="text-[10px] text-slate-500 ml-1 whitespace-nowrap">({acc.emp_num})</span></span>
                                       {acc.preferred_name && <span className="text-[10px] text-brand-400 font-semibold mt-0.5">Display Name: {acc.preferred_name}</span>}
                                       {acc.department && <span className="text-[9px] font-bold text-amber-500/80 mt-1 uppercase">Dept: {acc.department}</span>}
                                    </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {isEditing ? (
                                    <div className="flex justify-end gap-1">
                                       <button onClick={() => handleUpdateAccount(acc.username)} className="text-emerald-400 hover:text-emerald-300 bg-emerald-900/20 px-2 py-1 rounded text-[10px]">Save</button>
                                       <button onClick={() => setEditingAcc(null)} className="text-slate-400 hover:text-slate-300 bg-dark-800 px-2 py-1 rounded text-[10px]">Close</button>
                                    </div>
                                ) : (
                                    <div className="flex justify-end gap-1">
                                       <button onClick={() => {
                                           setEditingAcc(acc.username); setEditAccRole(acc.role); setEditAccName(acc.name || ''); setEditAccPreferredName(acc.preferred_name || ''); setEditAccEmpNum(acc.emp_num || ''); setEditAccDepartment(acc.department || ''); setEditAccPassword('');
                                       }} className="text-brand-300 hover:text-brand-200 bg-brand-900/20 px-2 py-1 rounded">Edit</button>
                                       <button onClick={() => handleDeleteAccount(acc.username)} className="text-red-400 hover:text-red-300 bg-red-900/20 px-2 py-1 rounded">Del</button>
                                    </div>
                                )}
                              </td>
                           </tr>
                        )})}
                        {accounts.filter(acc => {
                           if (!accSearch) return true;
                           const searchLower = accSearch.toLowerCase();
                           return (acc.username && acc.username.toLowerCase().includes(searchLower)) ||
                                  (acc.name && acc.name.toLowerCase().includes(searchLower));
                        }).length === 0 && <tr><td colSpan="4" className="text-center py-4 text-slate-500">No accounts found.</td></tr>}
                     </tbody>
                  </table>
               </div>
            </div>
          </div>
        )}

         {/* DOCUMENTS SECTION */}
        <div className="glass-card p-6 border-b border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)] w-full block">
           <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
             <div className="flex items-center gap-2">
                <AlignLeft className="w-5 h-5 text-emerald-400"/>
                <h2 className="text-base font-semibold text-white">Stored Knowledge by Document</h2>
             </div>
             <div className="flex items-center gap-3">
               <select 
                  value={docFilterDept} 
                  onChange={e => setDocFilterDept(e.target.value)} 
                  className="input-field py-1 px-3 text-xs bg-dark-900 border-white/5 rounded-lg text-slate-300 focus:border-emerald-500/50"
               >
                  <option value="All">All Departments</option>
                  <option value="General">General / Other</option>
                  <option value="AUDIT">AUDIT</option>
                  <option value="CBSL DIRECTIONS">CBSL DIRECTIONS</option>
                  <option value="COMPLIANCE">COMPLIANCE</option>
                  <option value="CREDIT">CREDIT</option>
                  <option value="CREDIT ADMINISTRATION UNIT">CREDIT ADMINISTRATION UNIT</option>
                  <option value="FINANCE">FINANCE</option>
                  <option value="GOLD LOAN">GOLD LOAN</option>
                  <option value="HR">HR</option>
                  <option value="IT">IT</option>
                  <option value="LEGAL">LEGAL</option>
                  <option value="MARKETING">MARKETING</option>
                  <option value="OPERATIONS AND ADMINISTRATION">OPERATIONS AND ADMINISTRATION</option>
                  <option value="RECOVERY">RECOVERY</option>
                  <option value="RISK MANAGEMENT">RISK MANAGEMENT</option>
                  <option value="STRATEGIC PLANNING">STRATEGIC PLANNING</option>
                  <option value="COMPANY SECRETARY">COMPANY SECRETARY</option>
                  <option value="SECRETARY TO CHAIRMAN">SECRETARY TO CHAIRMAN</option>
               </select>
               <span className="text-xs bg-dark-400 text-slate-300 px-3 py-1 rounded-full border border-white/10 font-mono">Total Embedded Chunks: {docCount ?? 0}</span>
             </div>
           </div>
           
           <div className="space-y-4 w-full block">
             {documents.length === 0 ? (
                 <p className="text-sm text-slate-500 text-center py-6">No documents tracked.</p>
             ) : (
                 documents.filter(doc => {
                    if (docFilterDept === 'All') return true;
                    // If department is null/empty, treat it as 'General'
                    const docDept = doc.department || 'General';
                    return docDept === docFilterDept;
                 }).map((doc) => {
                     // Check matching source filenames robustly
                     const docChunks = chunks.filter(c => 
                        c.metadata?.source_filename === doc.filename ||
                        (c.metadata?.source && c.metadata.source.endsWith(doc.filename))
                     );
                     const isEditing = editingDoc === doc.id;
                     const isExpanded = expandedDocs[doc.id];
                     
                     return (
                     <div key={doc.id} className="bg-dark-500/30 rounded-xl border border-white/5 overflow-hidden transition-all shadow-md w-full block">
                         <div className="bg-dark-400/50 px-4 py-3 flex flex-wrap gap-2 items-center justify-between border-b border-white/5 hover:bg-dark-400 transition cursor-pointer w-full" onClick={(e) => {
                             if(!e.target.closest('button') && !e.target.closest('input')) toggleDocExpand(doc.id);
                         }}>
                             <div className="flex items-center gap-3">
                                 {isExpanded ? <ChevronUp className="w-4 h-4 text-brand-400 shrink-0"/> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0"/>}
                                 <FileText className="w-4 h-4 text-brand-400 shrink-0" />
                                 {isEditing ? (
                                     <input type="text" value={editFilename} onChange={e=>setEditFilename(e.target.value)} className="input-field py-1 px-2 text-xs w-48 text-white bg-dark-700" onClick={e=>e.stopPropagation()}/>
                                 ) : (
                                    <span className="font-semibold text-sm text-slate-200">{doc.filename}</span>
                                 )}
                                 <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-white/5 whitespace-nowrap shrink-0">{docChunks.length} chunks</span>
                             </div>
                             
                             {!isEditing && (
                               <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
                                   {doc.start_date && <span>Start: {doc.start_date}</span>}
                                   {doc.expire_date && <span className="text-amber-400/80">Expires: {doc.expire_date}</span>}
                                   <span>Dept: <span className="text-slate-300">{doc.department || 'General'}</span></span>
                                   {doc.allowed_groups && <span>Groups: <span className="text-slate-300 max-w-[150px] inline-block align-bottom leading-tight">{doc.allowed_groups}</span></span>}
                                   {doc.allowed_emails && <span>Emails: <span className="text-slate-300 truncate max-w-[100px] inline-block align-bottom" title={doc.allowed_emails}>{doc.allowed_emails}</span></span>}
                                   <span>Admin: <span className="text-slate-300">{doc.admin_id}</span></span>
                                   
                                   <button onClick={(e) => {
                                      e.stopPropagation(); setEditingDoc(doc.id); setEditFilename(doc.filename); setEditStart(doc.start_date||''); setEditExpire(doc.expire_date||''); setEditDepartment(doc.department || 'General'); setEditAllowedEmails(doc.allowed_emails || ''); setEditAllowedGroups(doc.allowed_groups ? doc.allowed_groups.split(',') : []);
                                   }} className="text-brand-300 hover:text-brand-200 bg-brand-900/20 px-2 py-1 rounded transition-colors break-keep whitespace-nowrap"><Edit className="w-3 h-3 inline mr-1"/>Edit</button>
                                   <button onClick={(e) => { e.stopPropagation(); handleDelete(doc.filename); }} className="text-red-400 hover:text-red-300 bg-red-900/20 px-2 py-1 rounded transition-colors break-keep whitespace-nowrap"><Trash2 className="w-3 h-3 inline mr-1"/>Delete</button>
                               </div>
                             )}
                         </div>
                         
                         {isEditing && (
                            <div className="p-5 bg-dark-800/80 border-b border-white/5 w-full">
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                   <div>
                                     <label className="block text-[10px] font-medium text-slate-400 mb-1">Start Date</label>
                                     <input type="date" value={editStart} onChange={e=>setEditStart(e.target.value)} className="bg-dark-700 border border-white/10 rounded px-2 h-8 w-full text-white text-xs"/>
                                   </div>
                                   <div>
                                     <label className="block text-[10px] font-medium text-slate-400 mb-1">Expire Date</label>
                                     <input type="date" value={editExpire} onChange={e=>setEditExpire(e.target.value)} className="bg-dark-700 border border-white/10 rounded px-2 h-8 w-full text-white text-xs"/>
                                   </div>
                               </div>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                                   <div>
                                     <label className="block text-[10px] font-medium text-slate-400 mb-1">Target Department</label>
                                     <select value={editDepartment} onChange={e=>setEditDepartment(e.target.value)} className="bg-dark-700 border border-white/10 rounded px-2 h-8 w-full text-white text-xs">
                                        <option value="General">General / Other</option>
                                        <option value="RESTRICTED / PRIVATE">RESTRICTED / PRIVATE (Emails only)</option>
                                        <option value="AUDIT">AUDIT</option>
                                        <option value="CBSL DIRECTIONS">CBSL DIRECTIONS</option>
                                        <option value="COMPLIANCE">COMPLIANCE</option>
                                        <option value="CREDIT">CREDIT</option>
                                        <option value="CREDIT ADMINISTRATION UNIT">CREDIT ADMINISTRATION UNIT</option>
                                        <option value="FINANCE">FINANCE</option>
                                        <option value="GOLD LOAN">GOLD LOAN</option>
                                        <option value="HR">HR</option>
                                        <option value="IT">IT</option>
                                        <option value="LEGAL">LEGAL</option>
                                        <option value="MARKETING">MARKETING</option>
                                        <option value="OPERATIONS AND ADMINISTRATION">OPERATIONS AND ADMINISTRATION</option>
                                        <option value="RECOVERY">RECOVERY</option>
                                        <option value="RISK MANAGEMENT">RISK MANAGEMENT</option>
                                        <option value="STRATEGIC PLANNING">STRATEGIC PLANNING</option>
                                        <option value="COMPANY SECRETARY">COMPANY SECRETARY</option>
                                        <option value="SECRETARY TO CHAIRMAN">SECRETARY TO CHAIRMAN</option>
                                        <option value="MANCOM">MANCOM</option>
                                        <option value="CEO">CEO</option>
                                     </select>
                                   </div>
                                   <div>
                                     <label className="block text-[10px] font-medium text-slate-400 mb-1">Allowed Emails (Comma separated)</label>
                                     <input type="text" value={editAllowedEmails} onChange={e=>setEditAllowedEmails(e.target.value)} placeholder="e.g. user1@sdf.lk" className="bg-dark-700 border border-white/10 rounded px-2 h-8 w-full text-white text-xs"/>
                                   </div>
                               </div>
                               <div className="w-full mb-5">
                                 <label className="block text-[10px] font-medium text-slate-400 mb-2">Access Control Groups</label>
                                 <div className="flex flex-wrap gap-2.5 bg-dark-900/50 p-4 rounded-xl border border-white/5">
                                    {accessGroupsList.map(group => {
                                       const isSelected = editAllowedGroups.includes(group);
                                       return (
                                       <label key={group} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-white/5 rounded transition-colors w-[calc(50%-0.5rem)] md:w-auto">
                                          <div className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                                             <input 
                                               type="checkbox" 
                                               className="peer appearance-none w-3.5 h-3.5 bg-slate-800/80 border border-slate-600 rounded cursor-pointer checked:bg-emerald-500 checked:border-emerald-500 transition-all"
                                               checked={isSelected}
                                               onChange={(e) => {
                                                  if (e.target.checked) setEditAllowedGroups([...editAllowedGroups, group]);
                                                  else setEditAllowedGroups(editAllowedGroups.filter(g => g !== group));
                                               }}
                                             />
                                             <div className="pointer-events-none absolute opacity-0 peer-checked:opacity-100 text-white drop-shadow-sm">
                                               <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                             </div>
                                          </div>
                                          <span className={`text-[10px] font-medium transition-colors ${isSelected ? 'text-emerald-300' : 'text-slate-300'}`}>{group}</span>
                                       </label>
                                    )})}
                                 </div>
                               </div>
                               
                               <div className="flex gap-2 w-full justify-end mt-4 pt-4 border-t border-white/5">
                                 <button onClick={() => setEditingDoc(null)} className="text-slate-300 hover:text-white bg-dark-700 hover:bg-dark-600 px-4 py-2 rounded-lg transition-colors text-xs font-semibold">Cancel</button>
                                 <button onClick={() => handleSaveDoc(doc)} className="text-emerald-400 hover:text-emerald-300 bg-emerald-900/40 hover:bg-emerald-900/60 px-5 py-2 rounded-lg transition-colors text-xs font-semibold flex items-center shadow-lg shadow-emerald-900/20"><Save className="w-4 h-4 mr-1.5"/>Save Changes</button>
                               </div>
                            </div>
                         )}
                         
                         {isExpanded && (
                           <div className="p-2 overflow-x-auto max-h-80 overflow-y-auto animate-fade-in bg-dark-900/50 w-full block">
                                <table className="w-full text-left text-xs text-slate-400">
                                  <tbody className="divide-y divide-white/5 w-full block">
                                    {docChunks.map((c, i) => (
                                        <tr key={i} className="hover:bg-white/5 transition-colors flex w-full">
                                            <td className="px-3 py-2 whitespace-nowrap align-top text-brand-200 border-r border-white/5 w-20 shrink-0">Page {c.metadata?.page !== undefined ? c.metadata.page + 1 : '-'}</td>
                                            <td className="px-3 py-2 opacity-90 leading-relaxed flex-1 whitespace-pre-wrap">{c.text}</td>
                                        </tr>
                                    ))}
                                    {docChunks.length === 0 && <tr><td colSpan="2" className="px-3 py-2 text-center italic text-slate-500 text-[10px]">Chunks not found or pending sync for {doc.filename}.</td></tr>}
                                  </tbody>
                                </table>
                           </div>
                         )}
                     </div>
                 )})
             )}
           </div>
        </div>

      </div>
    </div>
  );
}
