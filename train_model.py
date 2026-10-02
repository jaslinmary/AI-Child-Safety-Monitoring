import pandas as pd
import numpy as np

from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, MaxPooling2D
from tensorflow.keras.layers import Flatten, Dense, Dropout
from tensorflow.keras.utils import to_categorical


# ---------------- LOAD DATASET ----------------

data = pd.read_csv("fer2013.csv")

print("Dataset loaded successfully!")
print("Number of records:", len(data))


# ---------------- PREPARE IMAGES ----------------

pixels = data["pixels"].tolist()

X = []

for pixel_sequence in pixels:
    image = np.array(
        pixel_sequence.split(),
        dtype="float32"
    )

    X.append(image)


X = np.array(X)

# Convert to 48 x 48 grayscale images
X = X.reshape(-1, 48, 48, 1)

# Normalize pixel values
X = X / 255.0


# ---------------- PREPARE LABELS ----------------

y = to_categorical(
    data["emotion"],
    num_classes=7
)


# ---------------- BUILD CNN ----------------

model = Sequential([

    Conv2D(
        32,
        (3, 3),
        activation="relu",
        input_shape=(48, 48, 1)
    ),

    MaxPooling2D((2, 2)),

    Conv2D(
        64,
        (3, 3),
        activation="relu"
    ),

    MaxPooling2D((2, 2)),

    Flatten(),

    Dense(
        128,
        activation="relu"
    ),

    Dropout(0.5),

    Dense(
        7,
        activation="softmax"
    )
])


# ---------------- COMPILE MODEL ----------------

model.compile(
    optimizer="adam",
    loss="categorical_crossentropy",
    metrics=["accuracy"]
)


# ---------------- TRAIN MODEL ----------------

print("Training started...")

history = model.fit(
    X,
    y,
    epochs=10,
    batch_size=64,
    validation_split=0.2
)


# ---------------- SAVE MODEL ----------------

model.save("emotion_model.keras")

print("Training completed!")

print("Model saved as emotion_model.keras")
