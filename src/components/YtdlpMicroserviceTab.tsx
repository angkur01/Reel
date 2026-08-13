import React, { useState, useEffect } from 'react';
import { ApiProvider, TestProviderResult } from '../types';
import {
  Terminal,
  CheckCircle2,
  AlertCircle,
  Play,
  Copy,
  Check,
  ExternalLink,
  Server,
  Zap,
  ShieldCheck,
  Cpu,
  Layers,
  Code,
  FileCode,
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface YtdlpMicroserviceTabProps {
  providers: ApiProvider[];
  onAddProvider: (p: Partial<ApiProvider>) => Promise<{ success: boolean; error?: string }>;
  onUpdateProvider: (id: string, p: Partial<ApiProvider>) => Promise<{ success: boolean; error?: string }>;
  onTestProvider: (id: string, testUrl?: string) => Promise<TestProviderResult | null>;
}

const MAIN_PY_CODE = `import os
import re
import json
import logging
from typing import Optional, Dict, Any
from fastapi import FastAPI, Query, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import yt_dlp

app = FastAPI(title="yt-dlp Instagram Scraper Microservice", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("API_KEY", "").strip()

def build_ydl_opts() -> Dict[str, Any]:
    return {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "socket_timeout": 20,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
        },
    }

def extract_reel_metadata(url: str) -> Dict[str, Any]:
    clean_url = url.strip()
    with yt_dlp.YoutubeDL(build_ydl_opts()) as ydl:
        info = ydl.extract_info(clean_url, download=False)
        if not info:
            raise RuntimeError("No metadata returned by extractor.")

    return {
        "success": True,
        "url": clean_url,
        "views": int(info.get("view_count") or info.get("play_count") or 0),
        "likes": int(info.get("like_count") or 0),
        "comments": int(info.get("comment_count") or 0),
        "shares": int(info.get("repost_count") or 0),
        "caption": str(info.get("description") or info.get("title") or "Instagram Reel").strip(),
        "author": str(info.get("uploader") or "Instagram User").strip().replace("@", ""),
        "thumbnail": info.get("thumbnail") or "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600",
        "video_url": info.get("url"),
        "duration": info.get("duration"),
    }

@app.get("/fetch")
@app.get("/reel")
def fetch_reel(url: str = Query(...)):
    try:
        return extract_reel_metadata(url)
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.get("/health")
def health():
    return {"status": "healthy", "yt_dlp_version": yt_dlp.version.__version__}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
`;

const DOCKERFILE_CODE = `FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \\
    ffmpeg \\
    ca-certificates \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;

const REQUIREMENTS_CODE = `fastapi>=0.110.0
uvicorn[standard]>=0.28.0
yt-dlp>=2024.8.6
pydantic>=2.6.0
`;

const RAILWAY_JSON_CODE = `{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "uvicorn main:app --host 0.0.0.0 --port $PORT",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
`;

const PROCFILE_CODE = `web: uvicorn main:app --host 0.0.0.0 --port $PORT
`;

const DOCKER_COMPOSE_CODE = `version: '3.8'

services:
  ytdlp-scraper:
    build: .
    container_name: ytdlp-scraper-microservice
    ports:
      - "8000:8000"
    environment:
      - PORT=8000
      - API_KEY=
    restart: unless-stopped
`;

export const YtdlpMicroserviceTab: React.FC<YtdlpMicroserviceTabProps> = ({
  providers,
  onAddProvider,
  onUpdateProvider,
  onTestProvider,
}) => {
  // Find existing yt-dlp provider if configured
  const existingProvider = providers.find(
    (p) => p.name.toLowerCase().includes('yt-dlp') || p.baseUrl.includes('railway') || p.id === 'provider_ytdlp_microservice'
  );

  const [serviceUrl, setServiceUrl] = useState(
    existingProvider?.baseUrl || 'https://your-ytdlp-scraper.up.railway.app'
  );
  const [apiKey, setApiKey] = useState(existingProvider?.apiKey || '');
  const [testReelUrl, setTestReelUrl] = useState(
    'https://www.instagram.com/reel/Db6jlRLFM5X/?igsh=dnNoaHRkYm1icTZk'
  );

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<TestProviderResult | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [activeCodeTab, setActiveCodeTab] = useState<'main.py' | 'Dockerfile' | 'requirements.txt' | 'railway.json' | 'Procfile' | 'docker-compose.yml'>('main.py');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deployTab, setDeployTab] = useState<'railway' | 'render' | 'docker'>('railway');

  useEffect(() => {
    if (existingProvider) {
      setServiceUrl(existingProvider.baseUrl);
      if (existingProvider.apiKey && !existingProvider.apiKey.includes('••••')) {
        setApiKey(existingProvider.apiKey);
      }
    }
  }, [existingProvider]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const getCodeContent = () => {
    switch (activeCodeTab) {
      case 'main.py':
        return MAIN_PY_CODE;
      case 'Dockerfile':
        return DOCKERFILE_CODE;
      case 'requirements.txt':
        return REQUIREMENTS_CODE;
      case 'railway.json':
        return RAILWAY_JSON_CODE;
      case 'Procfile':
        return PROCFILE_CODE;
      case 'docker-compose.yml':
        return DOCKER_COMPOSE_CODE;
      default:
        return MAIN_PY_CODE;
    }
  };

  // Test custom or temporary provider configuration
  const handleTestMicroservice = async () => {
    if (!serviceUrl || !serviceUrl.startsWith('http')) {
      setStatusMsg({ type: 'error', text: 'Please enter a valid HTTP/HTTPS URL for your microservice.' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    setStatusMsg(null);

    const tempProvider: ApiProvider = {
      id: existingProvider?.id || 'temp_ytdlp_test',
      name: '🐍 yt-dlp Microservice',
      baseUrl: serviceUrl.trim(),
      endpointPath: '/fetch',
      method: 'GET',
      apiKey: apiKey.trim(),
      apiKeyLocation: 'header_x_api_key',
      urlParamName: 'url',
      headersJson: '{\n  "Accept": "application/json"\n}',
      customBodyJson: '',
      mapping: {
        viewsPath: 'views',
        likesPath: 'likes',
        commentsPath: 'comments',
        sharesPath: 'shares',
        captionPath: 'caption',
        authorPath: 'author',
        thumbnailPath: 'thumbnail',
      },
      enabled: true,
      priority: 1,
    };

    try {
      const res = await fetch('/api/providers/test-raw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
        },
        body: JSON.stringify({
          provider: tempProvider,
          testUrl: testReelUrl,
        }),
      });

      const json = await res.json();
      setTesting(false);

      if (json.success && json.result) {
        setTestResult(json.result);
        if (json.result.success) {
          setStatusMsg({
            type: 'success',
            text: `Microservice successfully extracted reel metrics! (HTTP ${json.result.httpStatus})`,
          });
        } else {
          setStatusMsg({
            type: 'error',
            text: json.result.errorMessage || 'Microservice returned an error.',
          });
        }
      } else {
        setStatusMsg({
          type: 'error',
          text: json.error || 'Failed to communicate with provider.',
        });
      }
    } catch (e: any) {
      setTesting(false);
      setStatusMsg({
        type: 'error',
        text: e.message || 'Network error while testing microservice.',
      });
    }
  };

  // Save as Primary Active Provider
  const handleSaveAndActivate = async () => {
    if (!serviceUrl || !serviceUrl.startsWith('http')) {
      setStatusMsg({ type: 'error', text: 'Please enter a valid HTTP/HTTPS URL for your microservice.' });
      return;
    }

    setSaving(true);
    setStatusMsg(null);

    const providerPayload: Partial<ApiProvider> = {
      name: '🐍 yt-dlp Microservice (Railway / Docker)',
      baseUrl: serviceUrl.trim(),
      endpointPath: '/fetch',
      method: 'GET',
      apiKey: apiKey.trim(),
      apiKeyLocation: 'header_x_api_key',
      urlParamName: 'url',
      headersJson: '{\n  "Accept": "application/json"\n}',
      customBodyJson: '',
      mapping: {
        viewsPath: 'views',
        likesPath: 'likes',
        commentsPath: 'comments',
        sharesPath: 'shares',
        captionPath: 'caption',
        authorPath: 'author',
        thumbnailPath: 'thumbnail',
      },
      enabled: true,
      priority: 1,
    };

    let res: { success: boolean; error?: string };

    if (existingProvider) {
      res = await onUpdateProvider(existingProvider.id, providerPayload);
    } else {
      res = await onAddProvider(providerPayload);
    }

    setSaving(false);

    if (res.success) {
      setStatusMsg({
        type: 'success',
        text: '🎉 yt-dlp Microservice is now configured & set as your #1 Primary Scraper Provider!',
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'Failed to save provider configuration.',
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Banner */}
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-emerald-950/60 via-slate-950 to-indigo-950/60 border border-emerald-500/30 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>100% Free & Unlimited • Zero API Subscriptions</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <span>Self-Hosted yt-dlp Media Scraper Microservice</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Deploy a lightweight Python microservice on <b>Railway</b>, <b>Render</b>, or <b>Docker</b> using <code>yt-dlp</code>.
              It extracts exact play counts, view counts, like counts, and thumbnails for public Instagram reels directly without third-party API costs or rate-limit blocks!
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="https://railway.app"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg flex items-center gap-1.5 transition"
            >
              <span>Railway.app</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://render.com"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition"
            >
              <span>Render.com</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Notification Banner */}
      {statusMsg && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center gap-2.5 border ${
            statusMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="font-semibold">{statusMsg.text}</span>
        </div>
      )}

      {/* Step 1: Connect Deployed Microservice Live Form */}
      <div className="p-5 sm:p-6 bg-slate-950 border border-slate-800 rounded-3xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-white">Connect Your Deployed Microservice</h4>
            <p className="text-xs text-slate-400">
              Paste your Railway or Render public domain here to hook it up as your primary scraping engine.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <span>Microservice Base URL *</span>
              <span className="text-[10px] text-emerald-400 font-mono">(e.g. Railway / Render domain)</span>
            </label>
            <input
              type="text"
              value={serviceUrl}
              onChange={(e) => setServiceUrl(e.target.value)}
              placeholder="https://your-ytdlp-scraper.up.railway.app"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-slate-500 font-mono">Endpoint calls: {serviceUrl || 'https://...'}/fetch?url=...</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <span>Secret API Key</span>
              <span className="text-[10px] text-slate-500">(Optional - if API_KEY env var set)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Leave empty if public microservice..."
              className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-slate-500">Sent as <code>X-API-Key</code> header to your microservice.</p>
          </div>
        </div>

        {/* Test Reel URL */}
        <div className="space-y-1.5 text-xs">
          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Instagram Reel URL</span>
          </label>
          <input
            type="text"
            value={testReelUrl}
            onChange={(e) => setTestReelUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/..."
            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <button
            type="button"
            id="btn-test-ytdlp-microservice"
            onClick={handleTestMicroservice}
            disabled={testing || !serviceUrl}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-sky-200 border border-sky-500/30 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            {testing ? (
              <span className="w-4 h-4 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin"></span>
            ) : (
              <Play className="w-4 h-4 text-sky-400" />
            )}
            <span>{testing ? 'Pinging & Extracting...' : 'Test Connection & Sample Reel'}</span>
          </button>

          <button
            type="button"
            id="btn-save-ytdlp-primary"
            onClick={handleSaveAndActivate}
            disabled={saving || !serviceUrl}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>Set as #1 Primary API Provider</span>
          </button>
        </div>

        {/* Live Test Diagnostic Card */}
        {testResult && (
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold flex items-center gap-1.5">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                )}
                <span className={testResult.success ? 'text-emerald-400' : 'text-rose-400'}>
                  {testResult.success ? 'Microservice Verified (200 OK)' : 'Extraction Failed'}
                </span>
              </span>
              <span className="font-mono text-slate-400">HTTP {testResult.httpStatus}</span>
            </div>

            {testResult.errorMessage && (
              <div className="text-rose-300 font-mono text-[11px] bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                {testResult.errorMessage}
              </div>
            )}

            {testResult.parsedData && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 text-[10px] block">Views / Plays</span>
                  <strong className="text-emerald-400 font-mono text-sm">{testResult.parsedData.views?.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Likes</span>
                  <strong className="text-rose-400 font-mono text-sm">{testResult.parsedData.likes?.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Comments</span>
                  <strong className="text-amber-400 font-mono text-sm">{testResult.parsedData.comments?.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Author</span>
                  <strong className="text-slate-200 font-mono text-xs">@{testResult.parsedData.author || 'unknown'}</strong>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 2: 1-Click Deployment Step-by-Step Guide */}
      <div className="p-5 sm:p-6 bg-slate-950 border border-slate-800 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-purple-400" />
              <span>How to Deploy in Under 2 Minutes</span>
            </h4>
            <p className="text-xs text-slate-400">Choose your preferred hosting platform</p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setDeployTab('railway')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                deployTab === 'railway' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Railway (Recommended)
            </button>
            <button
              onClick={() => setDeployTab('render')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                deployTab === 'render' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Render (100% Free)
            </button>
            <button
              onClick={() => setDeployTab('docker')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                deployTab === 'docker' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Docker / Local VPS
            </button>
          </div>
        </div>

        {deployTab === 'railway' && (
          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-200">
              <b>Railway Deployment Steps:</b>
            </div>
            <ol className="list-decimal list-inside space-y-2.5 ml-1">
              <li>
                Create an account at <a href="https://railway.app" target="_blank" rel="noreferrer" className="text-purple-400 underline font-bold">Railway.app</a>.
              </li>
              <li>
                Click <b>+ New Project</b> &rarr; <b>Deploy from GitHub repo</b> (Select your repository or upload the files from <code>/microservice</code>).
              </li>
              <li>
                Railway will automatically detect the <code>Dockerfile</code> and <code>railway.json</code> configuration.
              </li>
              <li>
                Go to your project's <b>Settings</b> &rarr; <b>Networking</b> &rarr; Click <b>Generate Domain</b>.
              </li>
              <li>
                Copy the generated domain (e.g., <code>https://ytdlp-scraper-production.up.railway.app</code>) and paste it into the URL field above!
              </li>
            </ol>
          </div>
        )}

        {deployTab === 'render' && (
          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-200">
              <b>Render Free Web Service Steps:</b>
            </div>
            <ol className="list-decimal list-inside space-y-2.5 ml-1">
              <li>
                Open <a href="https://render.com" target="_blank" rel="noreferrer" className="text-teal-400 underline font-bold">Render.com</a> &rarr; <b>New +</b> &rarr; <b>Web Service</b>.
              </li>
              <li>
                Connect your GitHub repository.
              </li>
              <li>
                Set <b>Root Directory</b> to <code>microservice</code> (or root if standalone repo).
              </li>
              <li>
                Select <b>Runtime: Docker</b> (Render automatically builds the <code>Dockerfile</code> with <code>ffmpeg</code> & <code>yt-dlp</code>).
              </li>
              <li>
                Click <b>Create Web Service</b>. Once live, copy your <code>.onrender.com</code> URL and paste above!
              </li>
            </ol>
          </div>
        )}

        {deployTab === 'docker' && (
          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200">
              <b>Docker / Self-Hosted VPS Execution:</b>
            </div>
            <p>Run locally or on any cloud VPS (DigitalOcean, Hetzner, AWS, GCP) using Docker Compose:</p>
            <pre className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl text-emerald-400 font-mono select-all">
              cd microservice{'\n'}docker compose up -d --build
            </pre>
            <p>Microservice will run at <code>http://YOUR_SERVER_IP:8000/fetch?url=...</code>.</p>
          </div>
        )}
      </div>

      {/* Step 3: Interactive Code Inspector */}
      <div className="p-5 sm:p-6 bg-slate-950 border border-slate-800 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
              <FileCode className="w-4 h-4 text-indigo-400" />
              <span>Microservice Source Files & Configuration</span>
            </h4>
            <p className="text-xs text-slate-400">All files already generated in <code>/microservice/</code> in your project.</p>
          </div>

          <button
            onClick={() => handleCopy(getCodeContent(), activeCodeTab)}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
          >
            {copiedKey === activeCodeTab ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied {activeCodeTab}!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy {activeCodeTab}</span>
              </>
            )}
          </button>
        </div>

        {/* Code Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-800 pb-2">
          {(['main.py', 'Dockerfile', 'requirements.txt', 'railway.json', 'Procfile', 'docker-compose.yml'] as const).map((file) => (
            <button
              key={file}
              onClick={() => setActiveCodeTab(file)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono transition cursor-pointer ${
                activeCodeTab === file
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {file}
            </button>
          ))}
        </div>

        {/* Code Viewer */}
        <pre className="p-4 rounded-2xl bg-slate-900/90 text-indigo-200 font-mono text-[11px] overflow-x-auto border border-slate-800 max-h-96 select-all">
          {getCodeContent()}
        </pre>
      </div>

    </div>
  );
};
