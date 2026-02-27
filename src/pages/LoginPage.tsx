import { useState, useEffect } from 'react';
import { Film, LogIn, UserPlus, Loader2 } from 'lucide-react';
import { auth } from '../api';

interface Props {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register' | 'checking'>('checking');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    auth.check().then(({ hasAccount }) => {
      setMode(hasAccount ? 'login' : 'register');
    }).catch(() => setMode('register'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') await auth.register(username, password);
      else await auth.login(username, password);
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Er ging iets mis');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'checking') {
    return (
      <div className="flex h-screen bg-surface text-white items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-surface text-white items-center justify-center relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand-600/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-600/10 rounded-full blur-[128px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-500/5 rounded-full blur-[200px]" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow animate-float">
              <Film className="w-7 h-7 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Video Producer</h1>
          <p className="text-zinc-500 text-sm">
            {mode === 'register' ? 'Maak je account aan om te beginnen' : 'Log in om verder te gaan'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
              Gebruikersnaam
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-base"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
              Wachtwoord
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-base"
              required
              minLength={6}
            />
            {mode === 'register' && (
              <p className="text-[11px] text-zinc-600 mt-1.5">Minimaal 6 tekens</p>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm animate-fade-in">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-sm"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'register' ? (
              <><UserPlus className="w-4 h-4" /> Account Aanmaken</>
            ) : (
              <><LogIn className="w-4 h-4" /> Inloggen</>
            )}
          </button>
        </form>

        <p className="text-center text-[11px] text-zinc-600 mt-6">
          Pipeline Studio &middot; v2.0
        </p>
      </div>
    </div>
  );
}
