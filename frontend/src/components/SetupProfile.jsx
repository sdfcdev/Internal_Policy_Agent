import { useState } from 'react';
import { setupProfile } from '../api';

const SECURITY_QUESTIONS = [
  "What was the name of your first school?",
  "What is your mother's maiden name?",
  "What is the name of your favorite pet?",
  "In what city were you born?",
  "What was your first childhood nickname?",
  "What was the model of your first car?",
  "What is your favorite book or movie?"
];

export default function SetupProfile({ user, onComplete }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [q1, setQ1] = useState(SECURITY_QUESTIONS[0]);
  const [a1, setA1] = useState('');
  
  const [q2, setQ2] = useState(SECURITY_QUESTIONS[1]);
  const [a2, setA2] = useState('');
  
  const [q3, setQ3] = useState(SECURITY_QUESTIONS[2]);
  const [a3, setA3] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (q1 === q2 || q1 === q3 || q2 === q3) {
      setError("Please select three different security questions.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      await setupProfile(user.username, newPassword, q1, a1, q2, a2, q3, a3);
      onComplete({ ...user, is_first_login: false });
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to setup profile');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-card p-8 w-full max-w-lg glow-ring animate-fade-in shadow-2xl">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-white">Security Setup</h2>
        <p className="text-xs text-slate-400 mt-1">Set your password and security questions</p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">Set New Password</label>
          <input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required className="input-field py-2 text-sm w-full" />
        </div>
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">Confirm Password</label>
          <input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required className="input-field py-2 text-sm w-full" />
        </div>
        
        <div className="pt-2 border-t border-white/5 space-y-4">
            <p className="text-[10px] text-brand-400 font-semibold uppercase tracking-wider">Choose 3 Security Questions</p>
            
            <div className="grid grid-cols-1 gap-4">
              {/* Question 1 */}
              <div className="space-y-2">
                <select value={q1} onChange={e=>setQ1(e.target.value)} className="input-field py-1.5 text-xs w-full bg-dark-800">
                  {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
                <input type="text" value={a1} onChange={e=>setA1(e.target.value)} required placeholder="Your answer" className="input-field py-1.5 text-xs w-full" />
              </div>

              {/* Question 2 */}
              <div className="space-y-2">
                <select value={q2} onChange={e=>setQ2(e.target.value)} className="input-field py-1.5 text-xs w-full bg-dark-800">
                  {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
                <input type="text" value={a2} onChange={e=>setA2(e.target.value)} required placeholder="Your answer" className="input-field py-1.5 text-xs w-full" />
              </div>

              {/* Question 3 */}
              <div className="space-y-2">
                <select value={q3} onChange={e=>setQ3(e.target.value)} className="input-field py-1.5 text-xs w-full bg-dark-800">
                  {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
                <input type="text" value={a3} onChange={e=>setA3(e.target.value)} required placeholder="Your answer" className="input-field py-1.5 text-xs w-full" />
              </div>
            </div>
          </div>

          {error && <div className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 p-2 rounded">{error}</div>}
          
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2 rounded-lg font-medium shadow-sm transition">
            {loading ? 'Saving Profile...' : 'Complete Setup'}
          </button>
        </form>
      </div>
  );
}
