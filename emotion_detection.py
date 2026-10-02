import cv2
import numpy as np
import sqlite3
import time
import winsound

from datetime import datetime
from tensorflow.keras.models import load_model


# ---------------- DATABASE ----------------

conn = sqlite3.connect("emotion.db")

cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS emotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emotion TEXT,
    alert TEXT,
    timestamp TEXT
)
""")

conn.commit()


# ---------------- LOAD MODEL ----------------

model = load_model("emotion_model.keras")


# ---------------- EMOTION LABELS ----------------

emotion_labels = [
    "Angry",
    "Disgust",
    "Fear",
    "Happy",
    "Sad",
    "Surprise",
    "Neutral"
]


# ---------------- FACE DETECTOR ----------------

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades +
    "haarcascade_frontalface_default.xml"
)


# ---------------- PANIC VARIABLES ----------------

panic_pressed = False
panic_time = 0


# ---------------- MOUSE CALLBACK ----------------

def mouse_callback(event, x, y, flags, param):

    global panic_pressed
    global panic_time

    if event == cv2.EVENT_LBUTTONDOWN:

        if 10 < x < 150 and 10 < y < 50:

            panic_pressed = True
            panic_time = time.time()


# ---------------- WEBCAM ----------------

cap = cv2.VideoCapture(0)

cv2.namedWindow("Child Safety Monitoring")

cv2.setMouseCallback(
    "Child Safety Monitoring",
    mouse_callback
)


# ---------------- EMOTION HISTORY ----------------

emotion_history = []

last_emotion = None


# ---------------- MAIN LOOP ----------------

while True:

    ret, frame = cap.read()

    if not ret:
        print("Could not access webcam.")
        break


    # ---------------- PANIC BUTTON ----------------

    cv2.rectangle(
        frame,
        (10, 10),
        (150, 50),
        (0, 0, 255),
        -1
    )

    cv2.putText(
        frame,
        "PANIC",
        (30, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (255, 255, 255),
        2
    )


    # ---------------- FACE DETECTION ----------------

    gray = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2GRAY
    )

    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.3,
        minNeighbors=5
    )


    for (x, y, w, h) in faces:

        # ---------------- PREPROCESS FACE ----------------

        face = gray[y:y+h, x:x+w]

        face = cv2.resize(
            face,
            (48, 48)
        )

        face = face.astype("float32") / 255.0

        face = np.expand_dims(
            face,
            axis=-1
        )

        face = np.expand_dims(
            face,
            axis=0
        )


        # ---------------- PREDICTION ----------------

        prediction = model.predict(
            face,
            verbose=0
        )

        emotion_index = np.argmax(
            prediction
        )

        emotion = emotion_labels[
            emotion_index
        ]


        # ---------------- SMOOTHING ----------------

        emotion_history.append(emotion)

        if len(emotion_history) > 10:
            emotion_history.pop(0)

        emotion = max(
            set(emotion_history),
            key=emotion_history.count
        )


        # ---------------- FEAR DETECTION ----------------

        fear_probability = prediction[0][2]

        if fear_probability > 0.30:
            emotion = "Fear"


        # ---------------- ALERT ----------------

        if emotion == "Fear":

            alert = "Alert Sent"

            cv2.putText(
                frame,
                "ALERT! CHILD IN FEAR!",
                (50, 90),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 0, 255),
                3
            )

        else:

            alert = "No Alert"


        # ---------------- DRAW FACE ----------------

        cv2.rectangle(
            frame,
            (x, y),
            (x+w, y+h),
            (0, 255, 0),
            2
        )

        cv2.putText(
            frame,
            emotion,
            (x, y - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 255, 0),
            2
        )


        # ---------------- DATABASE ----------------

        if emotion != last_emotion:

            timestamp = datetime.now().strftime(
                "%Y-%m-%d %H:%M:%S"
            )

            cursor.execute(
                """
                INSERT INTO emotions
                (emotion, alert, timestamp)
                VALUES (?, ?, ?)
                """,
                (
                    emotion,
                    alert,
                    timestamp
                )
            )

            conn.commit()

            last_emotion = emotion


    # ---------------- PANIC ALERT ----------------

    if panic_pressed:

        if time.time() - panic_time < 3:

            cv2.putText(
                frame,
                "PANIC ALERT!",
                (50, 140),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 0, 255),
                3
            )

            winsound.Beep(
                1000,
                500
            )

        else:

            panic_pressed = False


    # ---------------- DISPLAY ----------------

    cv2.imshow(
        "Child Safety Monitoring",
        frame
    )


    # ---------------- KEYBOARD ----------------

    key = cv2.waitKey(1) & 0xFF


    if key == ord("q"):
        break


    if key == ord("p"):

        panic_pressed = True
        panic_time = time.time()


# ---------------- CLEANUP ----------------

cap.release()

cv2.destroyAllWindows()

conn.close()