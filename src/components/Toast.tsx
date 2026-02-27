import { useStore } from '../store';
import { CheckCircle, XCircle, Info, X, Bot } from 'lucide-react';

const TOAST_CONFIG: Record<string, { icon: any; color: string; border: string; bg: string }> = {
  success: { icon: CheckCircle, color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/5' },
  error: { icon: XCircle, color: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/5' },
  info: { icon: Info, color: 'text-brand-400', border: 'border-brand-500/30', bg: 'bg-brand-500/5' },
  ai: { icon: Bot, color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/5' },
};

export default function Toast() {
  const toasts = useStore((state) => state.toasts);
  const removeToast = useStore((state) => state.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-3">
      {toasts.map((toast, index) => {
        const c = TOAST_CONFIG[toast.type] || TOAST_CONFIG.info;
        const Icon = c.icon;
        return (
          <div
            key={toast.id}
            className={`glass ${c.bg} border-l-2 ${c.border} rounded-xl shadow-lg p-4 flex items-center gap-3 min-w-[320px] max-w-[420px] animate-slide-in`}
            style={{ animation: `slide-in 0.3s ease-out ${index * 0.08}s both` }}
          >
            <Icon className={`w-5 h-5 ${c.color} shrink-0`} />
            <p className="flex-1 text-sm text-zinc-200">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="btn-icon !p-1 text-zinc-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
