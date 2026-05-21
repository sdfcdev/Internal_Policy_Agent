import { useState } from 'react';
import { getUserQuestions, verifySecurity, resetForgottenPassword } from '../api';

export default function ForgotPassword({ onBack }) {
  const [step, setStep] = useState(1); // 1: identify, 2: verify answers, 3: reset
  const [username, setUsername] = useState('');
  
  const [questions, setQuestions] = useState(null); // {q1, q2, q3}
  const [a1, setA1] = useState('');
  const [a2, setA2] = useState('');
  const [a3, setA3] = useState('');
  
  const [newPassword, setNewPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleIdentify(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const q = await getUserQuestions(username);
      setQuestions(q);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.detail || 'User not found or security questions not set.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await verifySecurity(username, a1, a2, a3);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.detail || 'Verification failed. Incorrect answers.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await resetForgottenPassword(username, newPassword);
      setMessage('Password reset successful! You can now login.');
      setTimeout(onBack, 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8 z-10 w-full relative h-[100vh]">
      <div className="glass-card p-8 w-full max-w-md glow-ring animate-fade-in">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-medium text-white">Reset Password</h2>
          <p className="text-sm text-slate-400 mt-1">
            {step === 1 && 'Enter your Employee Number to begin'}
            {step === 2 && 'Answer your selected security questions'}
            {step === 3 && 'Set your new password'}
          </p>
        </div>

        {message ? (
          <div className="text-center py-4">
             <div className="text-sm text-green-400 bg-green-900/20 border border-green-500/30 p-3 rounded mb-4">{message}</div>
             <button onClick={onBack} className="text-xs text-slate-400 hover:text-white underline transition">Back to Login</button>
          </div>
        ) : (
          <form onSubmit={step === 1 ? handleIdentify : (step === 2 ? handleVerify : handleReset)} className="space-y-4">
            {step === 1 && (
              <div>
                <label className="block text-[13px] text-slate-400 mb-1">Employee Number</label>
                <input type="text" value={username} onChange={e=>setUsername(e.target.value)} required className="input-field py-2.5 text-base w-full" autoFocus />
              </div>
            )}

            {step === 2 && questions && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] text-slate-400 mb-1">{questions.q1}</label>
                  <input type="text" value={a1} onChange={e=>setA1(e.target.value)} required className="input-field py-2.5 text-base w-full" autoFocus />
                </div>
                <div>
                  <label className="block text-[13px] text-slate-400 mb-1">{questions.q2}</label>
                  <input type="text" value={a2} onChange={e=>setA2(e.target.value)} required className="input-field py-2.5 text-base w-full" />
                </div>
                <div>
                  <label className="block text-[13px] text-slate-400 mb-1">{questions.q3}</label>
                  <input type="text" value={a3} onChange={e=>setA3(e.target.value)} required className="input-field py-2.5 text-base w-full" />
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <label className="block text-[13px] text-slate-400 mb-1">New Password</label>
                <input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required className="input-field py-2.5 text-base w-full" autoFocus />
              </div>
            )}

            {error && <div className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 p-2 rounded">{error}</div>}
            
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2 rounded-lg font-medium shadow-sm transition">
              {loading ? 'Processing...' : (step === 1 ? 'Next' : (step === 2 ? 'Verify Answers' : 'Reset Password'))}
            </button>
            
            <div className="text-center mt-4">
              <button type="button" onClick={onBack} className="text-xs text-slate-400 hover:text-white underline transition">Back to Login</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
