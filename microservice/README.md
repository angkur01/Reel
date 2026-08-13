# 🐍 yt-dlp Instagram & Media Scraper Microservice

A lightweight, zero-subscription Python microservice built with **FastAPI** and **yt-dlp** to fetch exact real-time view counts, play counts, like counts, comment counts, reposts/shares, captions, authors, and high-resolution thumbnails from public Instagram Reels.

---

## 🚀 1-Click Deployment Options

### Option 1: Deploy on Railway (Recommended)
1. Fork or push this repository (or copy the `/microservice` directory into a new repo).
2. Open [Railway.app](https://railway.app) and create a **New Project** -> **Deploy from GitHub repo**.
3. Railway will automatically detect the `Dockerfile` and `railway.json`.
4. In Railway Settings -> **Networking**, click **Generate Domain** (e.g. `https://ytdlp-scraper-production.up.railway.app`).
5. Paste this domain into your **Instagram Reel Tracker** -> **Settings** -> **API Providers**!

### Option 2: Deploy on Render.com (100% Free Tier)
1. Go to [Render.com](https://render.com) -> **New Web Service**.
2. Connect your repository (or Root Directory: `microservice`).
3. Set **Runtime** to `Docker` or `Python 3`.
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python main.py`
4. Copy your live Render URL (e.g. `https://my-ytdlp-scraper.onrender.com`).

### Option 3: Run with Docker / Docker Compose
```bash
cd microservice
docker compose up -d --build
```
Your microservice will run locally at `http://localhost:8000`.

---

## 📡 API Endpoints

### 1. Extract Reel Metadata (GET)
```http
GET /fetch?url=https://www.instagram.com/reel/Db6jlRLFM5X/
```

**Response:**
```json
{
  "success": true,
  "url": "https://www.instagram.com/reel/Db6jlRLFM5X/",
  "id": "Db6jlRLFM5X",
  "views": 245900,
  "likes": 12850,
  "comments": 420,
  "shares": 195,
  "caption": "Check out this incredible moment! 🔥 #viral #reels",
  "author": "creator_name",
  "thumbnail": "https://scontent.cdninstagram.com/...",
  "video_url": "https://scontent.cdninstagram.com/...",
  "duration": 24.5,
  "timestamp": 1723500000
}
```

### 2. Extract Reel Metadata (POST)
```http
POST /fetch
Content-Type: application/json

{
  "url": "https://www.instagram.com/reel/Db6jlRLFM5X/"
}
```

### 3. Health Check
```http
GET /health
```
```json
{
  "status": "healthy",
  "yt_dlp_version": "2024.8.6",
  "auth_configured": false
}
```

---

## 🔒 Optional API Key Protection
To secure your microservice with an API Key:
1. In Railway/Render Environment Variables, set:
   ```env
   API_KEY="my-secret-token-123"
   ```
2. Call endpoints by passing either:
   - Header: `X-API-Key: my-secret-token-123`
   - Header: `Authorization: Bearer my-secret-token-123`
   - Query: `?api_key=my-secret-token-123`
