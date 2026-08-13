import os
import re
import json
import logging
from typing import Optional, Dict, Any
from fastapi import FastAPI, Query, Header, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import yt_dlp

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ytdlp_microservice")

app = FastAPI(
    title="yt-dlp Instagram & Media Scraper Microservice",
    description="High-performance, zero-subscription media scraper microservice extracting exact play counts, view counts, like counts, and thumbnails for Instagram Reels using yt-dlp.",
    version="1.0.0",
)

# Enable CORS for dashboard integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional API Key Authentication
API_KEY = os.getenv("API_KEY", "").strip()
PROXY_URL = os.getenv("PROXY_URL", "").strip()

class FetchRequest(BaseModel):
    url: str
    api_key: Optional[str] = None

def verify_auth(provided_key: Optional[str] = None, header_key: Optional[str] = None):
    if not API_KEY:
        return  # No API key required
    token = provided_key or header_key
    if token != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or missing API Key")

def build_ydl_opts(custom_proxy: Optional[str] = None) -> Dict[str, Any]:
    opts: Dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
        "ignoreerrors": False,
        "no_color": True,
        "socket_timeout": 20,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
    }
    proxy = custom_proxy or PROXY_URL
    if proxy:
        opts["proxy"] = proxy
    return opts

def extract_reel_metadata(url: str, custom_proxy: Optional[str] = None) -> Dict[str, Any]:
    clean_url = url.strip()
    if not clean_url.startswith("http"):
        clean_url = "https://" + clean_url

    ydl_opts = build_ydl_opts(custom_proxy)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(clean_url, download=False)
        except Exception as e:
            err_msg = str(e)
            logger.error(f"yt-dlp extraction failed for {clean_url}: {err_msg}")
            # Clean common yt-dlp error prefixes
            cleaned_err = re.sub(r"^ERROR:\s*", "", err_msg)
            raise RuntimeError(cleaned_err)

    if not info:
        raise RuntimeError("No metadata returned by extractor for this URL.")

    # Extract metrics with comprehensive fallback keys
    views = (
        info.get("view_count")
        or info.get("play_count")
        or info.get("views")
        or info.get("video_view_count")
        or 0
    )
    likes = (
        info.get("like_count")
        or info.get("likes")
        or info.get("likeCount")
        or 0
    )
    comments = (
        info.get("comment_count")
        or info.get("comments")
        or info.get("commentCount")
        or 0
    )
    shares = (
        info.get("repost_count")
        or info.get("share_count")
        or info.get("shares")
        or 0
    )

    caption = (
        info.get("description")
        or info.get("title")
        or info.get("caption")
        or "Instagram Reel"
    )

    author = (
        info.get("uploader")
        or info.get("uploader_id")
        or info.get("channel")
        or info.get("creator")
        or "Instagram User"
    )

    # Pick best thumbnail
    thumbnail = info.get("thumbnail")
    if not thumbnail and info.get("thumbnails"):
        thumbnails_list = info.get("thumbnails", [])
        if thumbnails_list:
            thumbnail = thumbnails_list[-1].get("url")

    video_url = info.get("url") or (info.get("formats", [{}])[-1].get("url") if info.get("formats") else None)

    return {
        "success": True,
        "url": clean_url,
        "id": info.get("id"),
        "views": int(views),
        "likes": int(likes),
        "comments": int(comments),
        "shares": int(shares),
        "caption": str(caption).strip(),
        "author": str(author).strip().replace("@", ""),
        "thumbnail": thumbnail or "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=600&q=80",
        "video_url": video_url,
        "duration": info.get("duration"),
        "extractor": info.get("extractor"),
        "timestamp": info.get("timestamp"),
    }

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "yt-dlp Instagram & Media Scraper Microservice",
        "version": "1.0.0",
        "endpoints": {
            "fetch_get": "GET /fetch?url={INSTAGRAM_REEL_URL}",
            "fetch_post": "POST /fetch (JSON body: {\"url\": \"...\"})",
            "health": "GET /health",
            "raw_dump": "GET /dump-json?url={INSTAGRAM_REEL_URL}"
        },
        "auth_required": bool(API_KEY),
    }

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "yt_dlp_version": yt_dlp.version.__version__,
        "auth_configured": bool(API_KEY),
    }

@app.get("/fetch")
@app.get("/reel")
def fetch_reel_get(
    url: str = Query(..., description="Instagram Reel URL to extract metadata for"),
    api_key: Optional[str] = Query(None, description="Optional API Key"),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    header_token = x_api_key
    if not header_token and authorization and authorization.startswith("Bearer "):
        header_token = authorization.split("Bearer ")[-1].strip()

    verify_auth(api_key, header_token)

    try:
        data = extract_reel_metadata(url)
        return data
    except Exception as e:
        logger.warning(f"Fetch failed for {url}: {str(e)}")
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(e),
                "url": url,
            }
        )

@app.post("/fetch")
@app.post("/reel")
def fetch_reel_post(
    req: FetchRequest,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    header_token = x_api_key
    if not header_token and authorization and authorization.startswith("Bearer "):
        header_token = authorization.split("Bearer ")[-1].strip()

    verify_auth(req.api_key, header_token)

    try:
        data = extract_reel_metadata(req.url)
        return data
    except Exception as e:
        logger.warning(f"Fetch failed for {req.url}: {str(e)}")
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(e),
                "url": req.url,
            }
        )

@app.get("/dump-json")
def dump_raw_json(
    url: str = Query(..., description="Instagram Reel URL to dump full yt-dlp JSON dictionary"),
    api_key: Optional[str] = Query(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    verify_auth(api_key, x_api_key)
    try:
        ydl_opts = build_ydl_opts()
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url.strip(), download=False)
            # Remove heavy non-serializable elements
            sanitized = ydl.sanitize_info(info)
            return sanitized
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
