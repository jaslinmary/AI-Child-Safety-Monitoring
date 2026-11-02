from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import cv2
import numpy as np
import sqlite3

from pathlib import Path

from ai_detector import detect_emotion


# =====================================================
# PATH
# =====================================================

BASE_DIR = Path(__file__).resolve().parent

DATABASE_PATH = BASE_DIR / "emotion.db"
FRONTEND_DIR = BASE_DIR / "SafeNest AI"


# =====================================================
# FASTAPI
# =====================================================

app = FastAPI(
    title="SafeNest AI API",
    description="AI-powered child safety monitoring backend",
    version="1.0.0"
)


# =====================================================
# CORS
# =====================================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=False,

    allow_methods=["*"],

    allow_headers=["*"]
)


# =====================================================
# HOME
# =====================================================

@app.get("/")
def home():

    return FileResponse(
        FRONTEND_DIR / "index.html"
    )


# =====================================================
# EMOTION DETECTION
# =====================================================

@app.post("/detect-emotion")
async def detect_emotion_api(
    file: UploadFile = File(...)
):

    try:

        # -------------------------------------------------
        # READ IMAGE
        # -------------------------------------------------

        image_bytes = await file.read()


        # -------------------------------------------------
        # CONVERT TO NUMPY
        # -------------------------------------------------

        image_array = np.frombuffer(
            image_bytes,
            np.uint8
        )


        # -------------------------------------------------
        # CONVERT TO OPENCV
        # -------------------------------------------------

        frame = cv2.imdecode(
            image_array,
            cv2.IMREAD_COLOR
        )


        # -------------------------------------------------
        # CHECK IMAGE
        # -------------------------------------------------

        if frame is None:

            return {
                "success": False,
                "error": "Invalid image"
            }


        # -------------------------------------------------
        # AI DETECTION
        # -------------------------------------------------

        # -------------------------------------------------
# AI DETECTION
# -------------------------------------------------

        result = detect_emotion(frame)

        return {
            "success": True,
            **result
        }
    except Exception as error:

        print(
            "Detection error:",
            error
        )

        return {
            "success": False,
            "error": str(error)
        }


# =====================================================
# GET ALL EMOTIONS
# =====================================================

@app.get("/emotions")
def get_emotions():

    conn = sqlite3.connect(
        DATABASE_PATH
    )

    cursor = conn.cursor()


    cursor.execute("""
        SELECT
            id,
            emotion,
            confidence,
            alert,
            timestamp
        FROM emotions
        ORDER BY id DESC
    """)


    rows = cursor.fetchall()

    conn.close()


    emotions = []


    for row in rows:

        emotions.append({

            "id": row[0],

            "emotion": row[1],

            "confidence": row[2],

            "alert": row[3],

            "timestamp": row[4]

        })


    return emotions


# =====================================================
# GET LATEST EMOTION
# =====================================================

@app.get("/latest-emotion")
def get_latest_emotion():

    conn = sqlite3.connect(
        DATABASE_PATH
    )

    cursor = conn.cursor()


    cursor.execute("""
        SELECT
            id,
            emotion,
            confidence,
            alert,
            timestamp
        FROM emotions
        ORDER BY id DESC
        LIMIT 1
    """)


    row = cursor.fetchone()

    conn.close()


    if row is None:

        return {
            "success": False,
            "message": "No emotion data available"
        }


    return {

        "success": True,

        "id": row[0],

        "emotion": row[1],

        "confidence": row[2],

        "alert": row[3],

        "timestamp": row[4]

    }


# =====================================================
# ALERT COUNT
# =====================================================

@app.get("/alert-count")
def get_alert_count():

    conn = sqlite3.connect(
        DATABASE_PATH
    )

    cursor = conn.cursor()


    cursor.execute("""
        SELECT COUNT(*)
        FROM emotions
        WHERE alert = 'Alert'
    """)


    count = cursor.fetchone()[0]

    conn.close()


    return {

        "success": True,

        "count": count

    }

# =====================================================
# FRONTEND STATIC FILES
# =====================================================

app.mount(
    "/",
    StaticFiles(directory=str(FRONTEND_DIR), html=True),
    name="frontend"
)

