import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from 'recharts';
import { BarChart3, TrendingUp, Film, Eye, Sparkles } from 'lucide-react';
import { Reel, ReelHistoryPoint } from '../types';

interface AnalyticsTabProps {
  reels: Reel[];
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ reels }) => {
  const [history, setHistory] = useState<ReelHistoryPoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedReelId, setSelectedReelId] = useState<string>('all');

  useEffect(() => {
    fetch('/api/reels/history')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setHistory(data.history || []);
        }
      })
      .catch((err) => console.error('[History Fetch Error]', err))
      .finally(() => setLoadingHistory(false));
  }, []);

  // Format Recharts data for Bar comparison chart
  const barChartData = reels.map((r) => ({
    name: r.name.length > 12 ? r.name.slice(0, 10) + '...' : r.name,
    views: r.views || 0,
    likes: r.likes || 0,
  })).sort((a, b) => b.views - a.views).slice(0, 8);

  // Filter and sort time-series history chart grouping
  const filteredHistory = selectedReelId === 'all'
    ? history
    : history.filter((h) => h.reelId === selectedReelId);

  const sortedHistory = [...filteredHistory].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const timeSeriesData = sortedHistory.map((h) => ({
    time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    views: h.views,
    likes: h.likes,
  }));

  return (
    <div className="space-y-6 pb-16">
      
      {/* Analytics Header */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Real-Time Analytics & Growth Metrics</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Performance Analytics Center
        </h2>
        <p className="text-xs sm:text-sm text-slate-300">
          Visualize growth velocity, view spikes, and engagement distribution across your Instagram Reels portfolio.
        </p>
      </div>

      {/* Top 8 Reels View Comparison Bar Chart */}
      <div className="glass-panel p-6 rounded-3xl space-y-4">
        <h3 className="font-extrabold text-white text-base flex items-center gap-2">
          <Eye className="w-5 h-5 text-indigo-400" />
          <span>Top Reels View Comparison</span>
        </h3>

        <div className="h-72 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '1rem', color: '#fff' }}
              />
              <Bar dataKey="views" fill="#6366f1" radius={[8, 8, 0, 0]} name="Views" />
              <Bar dataKey="likes" fill="#ec4899" radius={[8, 8, 0, 0]} name="Likes" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Time Series History Line Chart */}
      {timeSeriesData.length > 0 && (
        <div className="glass-panel p-6 rounded-3xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-extrabold text-white text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span>Time-Series View Velocity Snapshot</span>
            </h3>
            <select
              id="select-analytics-reel-filter"
              value={selectedReelId}
              onChange={(e) => setSelectedReelId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Reels History</option>
              {reels.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="h-72 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '1rem', color: '#fff' }}
                />
                <Line type="monotone" dataKey="views" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} name="Views" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Detailed Analytics Matrix Table */}
      <div className="glass-panel p-6 rounded-3xl space-y-4 overflow-hidden">
        <h3 className="font-extrabold text-white text-base">Reels Analytics Matrix</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Reel Name</th>
                <th className="py-3 px-4">Views</th>
                <th className="py-3 px-4">Likes</th>
                <th className="py-3 px-4">24h Growth</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {reels.map((reel) => (
                <tr key={reel.id} className="hover:bg-slate-900/40 transition">
                  <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                    <span>{reel.name}</span>
                    {reel.isViral && <span className="text-[10px] text-rose-400">🔥</span>}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-indigo-300">{(reel.views || 0).toLocaleString()}</td>
                  <td className="py-3 px-4 font-mono text-rose-300">{(reel.likes || 0).toLocaleString()}</td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-400">+{(reel.growth24h || 0).toLocaleString()}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      reel.status === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                      {reel.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-[10px]">
                    {reel.lastUpdatedAt ? new Date(reel.lastUpdatedAt).toLocaleTimeString() : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
