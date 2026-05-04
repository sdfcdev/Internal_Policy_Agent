import { useState, useRef, useCallback, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle2, XCircle, Loader2, Trash2, List, AlignLeft, Edit, Save, Users, PlusCircle, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { uploadPdf, getDocumentCount, getAdminLogs, getChunks, deleteDocument, renameDocument, updateDocument, getAccounts, addAccount, deleteAccount, updateAccount, getDocuments } from '../api';

function fileSizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AdminDashboard({ user, role }) {
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

  // New Admin fields
  const [startDate, setStartDate]       = useState('');
  const [expireDate, setExpireDate]     = useState('');

  // Editing state
  const [editingDoc, setEditingDoc]     = useState(null);
  const [editFilename, setEditFilename] = useState('');
  const [editStart, setEditStart]       = useState('');
  const [editExpire, setEditExpire]     = useState('');

  // Expand state for chunks
  const [expandedDocs, setExpandedDocs] = useState({});

  // Account form state
  const [accUsername, setAccUsername] = useState('');
  const [accPassword, setAccPassword] = useState('');
  const [accRole, setAccRole] = useState('user');
  const [accName, setAccName] = useState('');
  const [accEmpNum, setAccEmpNum] = useState('');

  // Account editing state
  const [editingAcc, setEditingAcc] = useState(null);
  const [editAccRole, setEditAccRole] = useState('');
  const [editAccName, setEditAccName] = useState('');
  const [editAccEmpNum, setEditAccEmpNum] = useState('');
  const [editAccPassword, setEditAccPassword] = useState('');

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
    setUploading(true);
    setError('');
    setResult(null);
    setProgress(0);

    try {
      const data = await uploadPdf(selectedFile, user.username, startDate, expireDate, pct => setProgress(pct));
      setResult(data);
      setSelectedFile(null);
      setStartDate('');
      setExpireDate('');
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
      await deleteDocument(filename);
      await fetchData();
    } catch (e) {
      alert("Failed to delete document: " + e.message);
    }
    setLoadingData(false);
  }

  async function handleSaveDoc(doc) {
    setLoadingData(true);
    try {
      if (doc.filename !== editFilename) {
          await renameDocument(doc.filename, editFilename, user.username);
      }
      await updateDocument(editFilename, editStart, editExpire, user.username);
      setEditingDoc(null);
      await fetchData();
    } catch (e) {
      alert("Failed to update: " + e.message);
    }
    setLoadingData(false);
  }

  async function handleAddAccount(e) {
    e.preventDefault();
    try {
      await addAccount(accUsername, accPassword, accRole, accName, accEmpNum, '', '');
      setAccUsername(''); setAccPassword(''); setAccName(''); setAccEmpNum('');
      await fetchData();
    } catch (e) {
      alert("Failed to add account: " + e.message);
    }
  }

  async function handleDeleteAccount(username) {
    if(!confirm(`Delete account for ${username}?`)) return;
    try {
      await deleteAccount(username);
      await fetchData();
    } catch (e) {
      alert("Failed to delete account: " + e.message);
    }
  }

  async function handleUpdateAccount(username) {
    try {
      await updateAccount(username, editAccRole, editAccName, editAccEmpNum, editAccPassword);
      setEditingAcc(null);
      await fetchData();
    } catch (e) {
      alert("Failed to update account: " + e.message);
    }
  }

  const toggleDocExpand = (id) => {
      setExpandedDocs(prev => ({...prev, [id]: !prev[id]}));
  };

  const downloadLogsPDF = async () => {
    try {
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
        doc.text("SDF Admin - Document Management Logs", 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);

        const columns = ["Date", "Action", "Admin ID", "File", "Chunks"];
        const rows = logs.map(l => [
          new Date(l.created_at).toLocaleString(),
          l.action,
          l.admin_id || "System",
          l.filename,
          l.chunks_count
        ]);

        doc.autoTable({
          head: [columns],
          body: rows,
          startY: 35,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [24, 24, 27] }, // Dark style to match theme
        });

        doc.save(`SDF_Admin_Logs_${Date.now()}.pdf`);
    } catch(e) {
        alert("Failed to generate PDF. Make sure you have internet access for the library.");
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-y-auto w-full">
      <header className="px-8 py-6 border-b border-white/10 flex justify-between items-center w-full shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage knowledge base documents and view logs</p>
        </div>
      </header>

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

            <div className="mt-4 grid grid-cols-2 gap-3 w-full">
               <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field py-1.5 px-3 text-xs w-full"/>
               </div>
               <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">Expire Date</label>
                  <input type="date" value={expireDate} onChange={e => setExpireDate(e.target.value)} className="input-field py-1.5 px-3 text-xs w-full"/>
               </div>
            </div>

            {uploading && (
              <div className="mt-4"><div className="flex justify-between text-xs text-slate-500 mb-1.5"><span>Uploading…</span><span>{progress}%</span></div><div className="w-full bg-dark-500 rounded-full h-1.5"><div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${progress}%` }} /></div></div>
            )}
            {error && <div className="mt-4 flex items-start gap-2.5 glass-card border-red-500/30 bg-red-900/10 px-4 py-3"><XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" /><p className="text-sm text-red-400 break-words">{error}</p></div>}
            {result && <div className="mt-4 flex items-start gap-2.5 glass-card border-emerald-500/30 bg-emerald-900/10 px-4 py-3"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /><div><p className="text-sm font-semibold text-emerald-300 break-words">{result.message}</p></div></div>}

            <button onClick={handleUpload} disabled={!selectedFile || uploading} className="btn-primary w-full mt-auto mt-4 flex items-center justify-center gap-2 shrink-0">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <><UploadCloud className="w-4 h-4" /> Ingest into Knowledge Base</>}
            </button>
          </div>

          {/* ACTION LOGS SECTION */}
          <div className="glass-card p-6 flex flex-col h-full max-h-[500px] w-full">
             <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <List className="w-5 h-5 text-brand-400"/>
                  <h2 className="text-base font-semibold text-white">Document Action Logs</h2>
                </div>
                <button onClick={downloadLogsPDF} className="flex items-center gap-1.5 bg-dark-600 hover:bg-brand-600/50 text-slate-300 text-[10px] px-2.5 py-1 rounded transition border border-white/5 shadow-sm">
                   <Download className="w-3.5 h-3.5" /> PDF
                </button>
             </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 w-full">
              {logs.length === 0 ? <p className="text-sm text-slate-500 text-center mt-10">No actions recorded yet.</p> : 
                logs.map(log => (
                  <div key={log.id} className="flex flex-col gap-1 text-sm bg-dark-500/50 p-3 rounded-xl border border-white/5 w-full">
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${log.action === 'UPLOAD' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                        {log.action}
                      </span>
                      <span className="text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-slate-300 font-medium truncate shrink" title={log.filename}>📄 {log.filename}</span>
                      <span className="text-xs text-slate-400 shrink-0 ml-2">{log.chunks_count} chunks</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">By: {log.admin_id || 'System'}</div>
                  </div>
                ))
              }
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
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
               <div className="col-span-1 bg-dark-800/50 p-4 rounded-xl border border-white/5 shadow-inner shrink-0">
                  <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1"><PlusCircle className="w-4 h-4"/> Add Account</h3>
                  <form onSubmit={handleAddAccount} className="space-y-3 w-full">
                     <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Username *</label>
                        <input type="text" value={accUsername} onChange={e=>setAccUsername(e.target.value)} required className="input-field py-1.5 px-3 text-xs w-full"/>
                     </div>
                     <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Password *</label>
                        <input type="text" value={accPassword} onChange={e=>setAccPassword(e.target.value)} required className="input-field py-1.5 px-3 text-xs w-full"/>
                     </div>
                     <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Role *</label>
                        <select value={accRole} onChange={e=>setAccRole(e.target.value)} className="input-field py-1.5 px-3 text-xs w-full cursor-pointer">
                           <option value="user">User</option>
                           <option value="subadmin">Sub-Admin</option>
                           {role === 'master' && <option value="admin">Admin</option>}
                        </select>
                     </div>
                     <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Name</label>
                        <input type="text" value={accName} onChange={e=>setAccName(e.target.value)} className="input-field py-1.5 px-3 text-xs w-full"/>
                     </div>
                     <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Employee Number</label>
                        <input type="text" value={accEmpNum} onChange={e=>setAccEmpNum(e.target.value)} className="input-field py-1.5 px-3 text-xs w-full"/>
                     </div>
                     <button type="submit" className="btn-primary w-full py-1.5 text-xs h-8 flex justify-center items-center">Create</button>
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
                        {accounts.map(acc => {
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
                              <td className="px-3 py-2 truncate">
                                {isEditing ? (
                                    <div className="flex flex-col gap-1">
                                       <input type="text" value={editAccName} onChange={e=>setEditAccName(e.target.value)} placeholder="Name" className="input-field py-1 px-2 text-[10px] w-full"/>
                                       <input type="text" value={editAccEmpNum} onChange={e=>setEditAccEmpNum(e.target.value)} placeholder="Emp Num" className="input-field py-1 px-2 text-[10px] w-full"/>
                                    </div>
                                ) : (
                                    <span>{acc.name} <span className="text-[10px] text-slate-500 ml-1">({acc.emp_num})</span></span>
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
                                          setEditingAcc(acc.username); setEditAccRole(acc.role); setEditAccName(acc.name || ''); setEditAccEmpNum(acc.emp_num || ''); setEditAccPassword('');
                                      }} className="text-brand-300 hover:text-brand-200 bg-brand-900/20 px-2 py-1 rounded">Edit</button>
                                      <button onClick={() => handleDeleteAccount(acc.username)} className="text-red-400 hover:text-red-300 bg-red-900/20 px-2 py-1 rounded">Del</button>
                                    </div>
                                )}
                              </td>
                           </tr>
                        )})}
                        {accounts.length === 0 && <tr><td colSpan="4" className="text-center py-4 text-slate-500">No accounts found.</td></tr>}
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
             <span className="text-xs bg-dark-400 text-slate-300 px-3 py-1 rounded-full border border-white/10 font-mono">Total Embedded Chunks: {docCount ?? 0}</span>
           </div>
           
           <div className="space-y-4 w-full block">
             {documents.length === 0 ? (
                 <p className="text-sm text-slate-500 text-center py-6">No documents tracked.</p>
             ) : (
                 documents.map((doc) => {
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
                                     <input type="text" value={editFilename} onChange={e=>setEditFilename(e.target.value)} className="input-field py-1 px-2 text-xs w-48 text-white bg-dark-700"/>
                                 ) : (
                                    <span className="font-semibold text-sm text-slate-200">{doc.filename}</span>
                                 )}
                                 <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-white/5 whitespace-nowrap shrink-0">{docChunks.length} chunks</span>
                             </div>
                             <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
                                 {isEditing ? (
                                    <>
                                       <div className="flex items-center gap-1">Start: <input type="date" value={editStart} onChange={e=>setEditStart(e.target.value)} className="bg-dark-700 border border-white/10 rounded px-1 h-6 text-white text-[10px]"/></div>
                                       <div className="flex items-center gap-1">End: <input type="date" value={editExpire} onChange={e=>setEditExpire(e.target.value)} className="bg-dark-700 border border-white/10 rounded px-1 h-6 text-white text-[10px]"/></div>
                                       <button onClick={() => handleSaveDoc(doc)} className="text-emerald-400 hover:text-emerald-300 bg-emerald-900/20 px-2 py-1 h-6 rounded transition-colors break-keep whitespace-nowrap"><Save className="w-3 h-3 inline mr-1"/>Save</button>
                                       <button onClick={() => setEditingDoc(null)} className="text-slate-400 hover:text-slate-300 bg-dark-800 px-2 py-1 h-6 rounded transition-colors break-keep whitespace-nowrap">Cancel</button>
                                    </>
                                 ) : (
                                    <>
                                       {doc.start_date && <span>Start: {doc.start_date}</span>}
                                       {doc.expire_date && <span className="text-amber-400/80">Expires: {doc.expire_date}</span>}
                                       <span>Admin: <span className="text-slate-300">{doc.admin_id}</span></span>
                                       
                                       <button onClick={() => {
                                          setEditingDoc(doc.id); setEditFilename(doc.filename); setEditStart(doc.start_date||''); setEditExpire(doc.expire_date||'');
                                       }} className="text-brand-300 hover:text-brand-200 bg-brand-900/20 px-2 py-1 rounded transition-colors break-keep whitespace-nowrap"><Edit className="w-3 h-3 inline mr-1"/>Edit</button>
                                       <button onClick={() => handleDelete(doc.filename)} className="text-red-400 hover:text-red-300 bg-red-900/20 px-2 py-1 rounded transition-colors break-keep whitespace-nowrap"><Trash2 className="w-3 h-3 inline mr-1"/>Delete</button>
                                    </>
                                 )}
                             </div>
                         </div>
                         
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
