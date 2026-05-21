import { useState } from 'react';
import { register } from '../api';

const SECURITY_QUESTIONS = [
  "What was the name of your first school?",
  "What is your mother's maiden name?",
  "What is the name of your favorite pet?",
  "In what city were you born?",
  "What was your first childhood nickname?",
  "What was the model of your first car?",
  "What is your favorite book or movie?"
];

const PASSWORD_RULES = [
  { id: 'length', label: 'Minimum 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'upper', label: 'One uppercase letter (A-Z)', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lower', label: 'One lowercase letter (a-z)', test: (pw) => /[a-z]/.test(pw) },
  { id: 'number', label: 'One number (0-9)', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'One special char (e.g. @, #, $, %)', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export default function Register({ onBack, onComplete }) {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [q1, setQ1] = useState(SECURITY_QUESTIONS[0]);
  const [a1, setA1] = useState('');
  
  const [q2, setQ2] = useState(SECURITY_QUESTIONS[1]);
  const [a2, setA2] = useState('');
  
  const [q3, setQ3] = useState(SECURITY_QUESTIONS[2]);
  const [a3, setA3] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const allPassed = PASSWORD_RULES.every(rule => rule.test(password));
    if (!allPassed) {
      setError("Please meet all password strength requirements.");
      return;
    }
    if (q1 === q2 || q1 === q3 || q2 === q3) {
      setError("Please select three different security questions.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      await register(username, password, name, q1, a1, q2, a2, q3, a3);
      setSuccess(true);
      setTimeout(() => onBack(), 2500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Is your Employee Number authorized?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8 z-10 w-full relative h-[100vh]">
      <div className="glass-card p-8 w-full max-w-lg glow-ring animate-fade-in">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-medium text-white">Staff Registration</h2>
          <p className="text-sm text-slate-400 mt-1">Please enter your Employee Number and set up your security credentials</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] text-slate-400 mb-1">Employee Number</label>
              <input type="text" value={username} onChange={e=>setUsername(e.target.value)} required className="input-field py-2.5 text-base w-full" autoFocus />
            </div>
            <div>
              <label className="block text-[13px] text-slate-400 mb-1">Preferred Display Name</label>
              <input type="text" value={name} onChange={e=>setName(e.target.value)} required className="input-field py-2.5 text-base w-full" placeholder="e.g. Manoj" />
            </div>
            <div>
              <label className="block text-[13px] text-slate-400 mb-1">Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required className="input-field py-2.5 text-base w-full" />
            </div>
            <div>
              <label className="block text-[13px] text-slate-400 mb-1">Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required className="input-field py-2.5 text-base w-full" />
            </div>

            {password && (
              <div className="bg-dark-900/40 p-3 rounded-lg border border-white/5 space-y-1.5 animate-fade-in col-span-2">
                <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Password Strength Requirements</p>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  {PASSWORD_RULES.map(rule => {
                    const passed = rule.test(password);
                    return (
                      <div key={rule.id} className="flex items-center gap-1.5">
                        <span className={passed ? "text-emerald-400 font-bold" : "text-slate-600"}>
                          {passed ? "✓" : "○"}
                        </span>
                        <span className={passed ? "text-emerald-300/80" : "text-slate-500"}>
                          {rule.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          
          <div className="pt-2 border-t border-white/5 space-y-4">
            <p className="text-xs text-brand-400 font-semibold uppercase tracking-wider">Choose 3 Security Questions</p>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <select value={q1} onChange={e=>setQ1(e.target.value)} className="input-field py-2 text-sm w-full bg-dark-800">
                  {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
                <input type="text" value={a1} onChange={e=>setA1(e.target.value)} required placeholder="Your answer" className="input-field py-2 text-sm w-full" />
              </div>

              <div className="space-y-2">
                <select value={q2} onChange={e=>setQ2(e.target.value)} className="input-field py-2 text-sm w-full bg-dark-800">
                  {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
                <input type="text" value={a2} onChange={e=>setA2(e.target.value)} required placeholder="Your answer" className="input-field py-2 text-sm w-full" />
              </div>

              <div className="space-y-2">
                <select value={q3} onChange={e=>setQ3(e.target.value)} className="input-field py-2 text-sm w-full bg-dark-800">
                  {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
                <input type="text" value={a3} onChange={e=>setA3(e.target.value)} required placeholder="Your answer" className="input-field py-2 text-sm w-full" />
              </div>
            </div>
          </div>

          {success && <div className="text-sm text-emerald-300 bg-emerald-900/30 border border-emerald-500/30 p-3 rounded-lg flex items-center gap-2 animate-fade-in">✅ Registration successful! Redirecting to login...</div>}
          {error && <div className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 p-2 rounded">{error}</div>}
          
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2 rounded-lg font-medium shadow-sm transition">
            {loading ? 'Processing...' : 'Register Account'}
          </button>
          
          <div className="text-center mt-2">
            <button type="button" onClick={onBack} className="text-xs text-slate-400 hover:text-white underline transition">Already have an account? Login</button>
          </div>
        </form>
      </div>
    </div>
  );
}
