import os
import threading
import time
import base64

import numpy as np
import cv2
import mediapipe as mp
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from tensorflow.keras.models import load_model

# ===============================
# Paths
# ===============================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
TEMPLATES_DIR = os.path.join(FRONTEND_DIR, "templates")
STATIC_DIR = os.path.join(FRONTEND_DIR, "static")
MODELS_DIR = os.path.join(BASE_DIR, "models")

# ===============================
# Flask Setup
# ===============================
app = Flask(
    __name__,
    template_folder=TEMPLATES_DIR,
    static_folder=STATIC_DIR
)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024  # 2MB limit

# ===============================
# Load Model + Labels
# ===============================
model, labels, label_to_id = None, [], {}

try:
    model_path = os.path.join(MODELS_DIR, "landmark_model.keras")
    model = load_model(model_path)

    labels_path = os.path.join(MODELS_DIR, "labels.txt")
    with open(labels_path, "r") as f:
        parsed = []
        for line in f:
            parts = line.strip().split(maxsplit=1)
            parsed.append(parts[1] if len(parts) > 1 else (parts[0] if parts else ""))
        labels = [lbl for lbl in parsed if lbl]

    label_to_id = {label.lower(): str(i) for i, label in enumerate(labels)}

    print("[INFO] Model and labels loaded successfully.")
    print(f"[INFO] Labels: {labels}")
except Exception as e:
    print(f"[ERROR] Could not load model or labels: {e}")

# ===============================
# MediaPipe Setup
# ===============================
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7,
)
inference_lock = threading.Lock()

# ===============================
# Routes
# ===============================
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "labels_count": len(labels),
        "labels": labels,
        "mediapipe": True
    })

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/predict", methods=["POST"])
def predict():
    start_ts = time.time()

    if model is None or not labels:
        return jsonify({"error": "Model not loaded"}), 500

    try:
        data = request.get_json()
        if not data or "image" not in data:
            return jsonify({"error": "Missing image data"}), 400

        base64_image = data["image"]
        if "," in base64_image:
            base64_image = base64_image.split(",")[1]

        img_data = base64.b64decode(base64_image)
        npimg = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
        if img is None:
            return jsonify({"error": "Invalid image"}), 400

        imgRGB = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        with inference_lock:
            results = hands.process(imgRGB)

            if results.multi_hand_landmarks:
                hand_landmarks = results.multi_hand_landmarks[0]
                landmark_data = []
                for lm in hand_landmarks.landmark:
                    landmark_data.extend([lm.x, lm.y])

                prediction = model.predict(np.array([landmark_data]), verbose=0)
                label_index = int(np.argmax(prediction))
                confidence = float(np.max(prediction))
                label_name = labels[label_index] if 0 <= label_index < len(labels) else str(label_index)

                latency_ms = int((time.time() - start_ts) * 1000)
                return jsonify({
                    "prediction": str(label_index),
                    "label": label_name,
                    "confidence": confidence,
                    "latency_ms": latency_ms
                })

        latency_ms = int((time.time() - start_ts) * 1000)
        return jsonify({"prediction": "unknown", "confidence": 0.0, "latency_ms": latency_ms})

    except Exception as e:
        print("[ERROR] Prediction failed:", str(e))
        return jsonify({"error": str(e)}), 500

# ===============================
# Run App
# ===============================
if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
