import cv2
import numpy as np
import sqlite3
from datetime import datetime
from pathlib import Path
from tensorflow.keras.models import load_model


# =====================================================
# PATHS
# =====================================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = BASE_DIR / "emotion_model.keras"
DATABASE_PATH = BASE_DIR / "emotion.db"


# =====================================================
# LOAD AI MODEL
# =====================================================

print("Loading emotion model...")

model = load_model(MODEL_PATH)

print("Emotion model loaded successfully.")


# =====================================================
# EMOTION LABELS
# =====================================================

emotion_labels = [
    "Angry",
    "Disgust",
    "Fear",
    "Happy",
    "Sad",
    "Surprise",
    "Neutral"
]


# =====================================================
# FACE DETECTOR
# =====================================================

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades +
    "haarcascade_frontalface_default.xml"
)


# =====================================================
# DATABASE
# =====================================================

conn = sqlite3.connect(
    DATABASE_PATH,
    check_same_thread=False
)

cursor = conn.cursor()


cursor.execute("""
CREATE TABLE IF NOT EXISTS emotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emotion TEXT,
    confidence REAL,
    alert TEXT,
    timestamp TEXT
)
""")


conn.commit()


# =====================================================
# EMOTION DETECTION
# =====================================================

def detect_emotion(frame):

    # -------------------------------------------------
    # CONVERT TO GRAYSCALE
    # -------------------------------------------------

    gray = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2GRAY
    )

    gray = cv2.equalizeHist(gray)


    # -------------------------------------------------
    # FIND FACE
    # -------------------------------------------------

    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(60, 60)
    )


    # -------------------------------------------------
    # NO FACE
    # -------------------------------------------------

    if len(faces) == 0:

        return {
            "emotion": "No Face",
            "confidence": 0,
            "face_detected": False,
            "safety_status": "Unknown",
            "alert": "No Alert",
            "timestamp": datetime.now().strftime(
                "%Y-%m-%d %H:%M:%S"
            )
        }


    # -------------------------------------------------
    # SELECT LARGEST FACE
    # -------------------------------------------------

    face_data = max(
        faces,
        key=lambda rectangle: rectangle[2] * rectangle[3]
    )

    x, y, w, h = face_data


    # -------------------------------------------------
    # CROP FACE
    # -------------------------------------------------

    face = gray[
        y:y+h,
        x:x+w
    ]


    # -------------------------------------------------
    # PREPARE IMAGE
    # -------------------------------------------------

    face = cv2.resize(
        face,
        (48, 48)
    )

    face = face.astype(
        "float32"
    ) / 255.0

    face = np.expand_dims(
        face,
        axis=-1
    )

    face = np.expand_dims(
        face,
        axis=0
    )


    # -------------------------------------------------
    # AI PREDICTION
    # -------------------------------------------------

    prediction = model.predict(
        face,
        verbose=0
    )


    emotion_index = int(
        np.argmax(prediction)
    )


    emotion = emotion_labels[
        emotion_index
    ]


    confidence = float(
        prediction[0][emotion_index] * 100
    )


    # -------------------------------------------------
    # FEAR DETECTION
    # -------------------------------------------------

    fear_probability = float(
        prediction[0][2]
    )


    if fear_probability > 0.30:

        emotion = "Fear"

        confidence = (
            fear_probability * 100
        )


    # -------------------------------------------------
    # SAFETY STATUS
    # -------------------------------------------------

    if emotion == "Fear":

        alert = "Alert"
        safety_status = "Alert"

    else:

        alert = "No Alert"
        safety_status = "Safe"


    # -------------------------------------------------
    # TIMESTAMP
    # -------------------------------------------------

    timestamp = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )


    # -------------------------------------------------
    # SAVE RESULT
    # -------------------------------------------------

    cursor.execute(
        """
        INSERT INTO emotions
        (
            emotion,
            confidence,
            alert,
            timestamp
        )
        VALUES (?, ?, ?, ?)
        """,
        (
            emotion,
            round(confidence, 2),
            alert,
            timestamp
        )
    )


    conn.commit()


    # -------------------------------------------------
    # RETURN RESULT
    # -------------------------------------------------

    return {

        "emotion": emotion,

        "confidence": round(
            confidence,
            2
        ),

        "face_detected": True,

        "safety_status": safety_status,

        "alert": alert,

        "timestamp": timestamp,

        "face_box": {
            "x": int(x),
            "y": int(y),
            "width": int(w),
            "height": int(h)
        }

    }






