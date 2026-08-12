import React from 'react';
import { FetchLog } from '../types';
import { X, FileText, CheckCircle2, AlertCircle, RefreshCw, Send } from 'lucide-react';

interface LogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: FetchLog[];
}

export const LogsModal: React.FC<LogsModalProps> = ({ isOpen, onClose, logs }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-purple-400" />
            <h2 className="text-base font-bold text-white">Fetch History & System Logs</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Logs List Container */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3 font-mono text-xs">
          {logs.length > 0 ? (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {log.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="font-bold text-slate-200">{log.reelName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 capitalize font-sans">
                      {log.type.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-500 font-sans">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                  <span>Provider: <strong className="text-slate-300">{log.providerName}</strong></span>

                  {log.status === 'success' && log.statsAdded && (
                    <span className="text-emerald-400">
                      Views: {log.statsAdded.views.toLocaleString()} · Likes: {log.statsAdded.likes.toLocaleString()}
                    </span>
                  )}
                </div>

                {log.errorMessage && (
                  <div className="mt-1 p-2 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-[11px] break-words">
                    {log.errorMessage}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-slate-500">
              No fetch history recorded yet.
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
