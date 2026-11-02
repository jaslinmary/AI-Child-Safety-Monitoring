
/* =====================================================
   SAFENEST AI - MAIN JAVASCRIPT
   Camera + FastAPI + Emotion Detection
===================================================== */

"use strict";

/* =====================================================
   CONFIGURATION
===================================================== */

const API_URL = "http://127.0.0.1:8000/detect-emotion";
const DEFAULT_INTERVAL = 3000;

/* =====================================================
   GLOBAL VARIABLES
===================================================== */

let cameraStream = null;
let microphoneStream = null;

let liveDetectionRunning = false;
let detectionRequestInProgress = false;
let detectionLoopId = 0;
let cameraStarting = false;
let microphoneEnabled = false;

/* =====================================================
   ELEMENTS
===================================================== */

const video = document.getElementById("cameraVideo");
const cameraBtn = document.getElementById("cameraBtn");
const micBtn = document.getElementById("micBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const cameraScreen = document.getElementById("cameraScreen");

/* =====================================================
   CURRENT DATE
===================================================== */

const currentDate = document.getElementById("currentDate");

if (currentDate) {
    currentDate.textContent = new Date().toLocaleDateString(
        "en-IN",
        { day: "2-digit", month: "short", year: "numeric" }
    );
}

/* =====================================================
   MOBILE SIDEBAR
===================================================== */

const mobileMenu = document.getElementById("mobileMenu");
const sidebar = document.querySelector(".sidebar");

if (mobileMenu && sidebar) {
    mobileMenu.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        sidebar.classList.toggle("show");
    });

    document.addEventListener("click", (event) => {
        if (
            window.innerWidth <= 800 &&
            !sidebar.contains(event.target) &&
            !mobileMenu.contains(event.target)
        ) {
            sidebar.classList.remove("show");
        }
    });
}

/* =====================================================
   CAMERA CLOCK
===================================================== */

const cameraTime = document.getElementById("cameraTime");

function updateCameraTime() {
    if (cameraTime) {
        cameraTime.textContent = new Date().toLocaleTimeString(
            "en-IN",
            { hour12: false }
        );
    }
}

if (cameraTime) {
    updateCameraTime();
    setInterval(updateCameraTime, 1000);
}

/* =====================================================
   SETTINGS
===================================================== */

function getSafeNestSettings() {
    return {
        detectionInterval: DEFAULT_INTERVAL / 1000
    };
}

/* =====================================================
   CAMERA BUTTON STATE
===================================================== */

function updateCameraButton(isOn) {
    if (!cameraBtn) return;

    const icon = cameraBtn.querySelector("i");

    if (icon) {
        icon.classList.toggle("bi-camera-video-fill", isOn);
        icon.classList.toggle("bi-camera-video-off-fill", !isOn);
    }

    cameraBtn.title = isOn ? "Turn camera off" : "Turn camera on";
    cameraBtn.setAttribute("aria-pressed", String(isOn));
}

/* =====================================================
   START CAMERA
===================================================== */

async function startSafeNestCamera() {
    if (!video || cameraStarting || cameraStream) return;

    if (!navigator.mediaDevices?.getUserMedia) {
        alert("Camera access is unavailable. Open this page using localhost or HTTPS.");
        return;
    }

    cameraStarting = true;

    try {
        console.log("Requesting camera permission...");

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            },
            audio: false
        });

        // If another action happened while permission was pending,
        // release the newly acquired camera.
        if (!cameraStarting) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }

        cameraStream = stream;
        video.srcObject = stream;
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;

        // Ensure the video is visible in the camera panel.
        video.style.display = "block";
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "cover";

        await new Promise((resolve, reject) => {
            if (video.readyState >= 2 && video.videoWidth > 0) {
                resolve();
                return;
            }

            const onReady = () => {
                cleanup();
                resolve();
            };

            const onError = () => {
                cleanup();
                reject(new Error("Camera video could not start."));
            };

            const cleanup = () => {
                video.removeEventListener("loadeddata", onReady);
                video.removeEventListener("error", onError);
            };

            video.addEventListener("loadeddata", onReady, { once: true });
            video.addEventListener("error", onError, { once: true });

            video.play().catch(error => {
                cleanup();
                reject(error);
            });
        });

        await video.play();

        console.log("Camera started:", video.videoWidth, video.videoHeight);

        updateCameraButton(true);
        startLiveDetection();

    } catch (error) {
        console.error("Camera start error:", error);

        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }

        if (video) video.srcObject = null;

        updateCameraButton(false);

        if (error.name === "NotAllowedError") {
            alert("Camera permission denied. Allow camera access in your browser.");
        } else if (error.name === "NotFoundError") {
            alert("No camera was found. Connect or enable a camera.");
        } else {
            alert("Could not start the camera: " + error.message);
        }
    } finally {
        cameraStarting = false;
    }
}

/* =====================================================
   STOP CAMERA AND AI DETECTION
===================================================== */

function stopSafeNestCamera() {
    console.log("Stopping camera and AI detection...");

    // Invalidate any currently running detection loop.
    liveDetectionRunning = false;
    detectionLoopId++;

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    if (video) {
        video.pause();
        video.srcObject = null;
    }

    // Stop the microphone too, if one was explicitly enabled.
    if (microphoneStream) {
        microphoneStream.getTracks().forEach(track => track.stop());
        microphoneStream = null;
    }

    microphoneEnabled = false;
    updateMicrophoneButton(false);
    updateCameraButton(false);

    console.log("Camera, microphone and detection stopped.");
}

/* =====================================================
   CAMERA ON/OFF BUTTON
===================================================== */

if (cameraBtn) {
    cameraBtn.addEventListener("click", async (event) => {
        event.preventDefault();

        if (cameraStream || cameraStarting) {
            cameraStarting = false;
            stopSafeNestCamera();
        } else {
            await startSafeNestCamera();
        }
    });
}

/* =====================================================
   CAPTURE FRAME AND SEND TO FASTAPI
===================================================== */

async function captureAndDetectEmotion() {
    if (!video || !cameraStream || !cameraStream.active) return;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    if (detectionRequestInProgress) return;

    detectionRequestInProgress = true;

    try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Unable to create canvas.");
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
                result => result
                    ? resolve(result)
                    : reject(new Error("Could not capture camera frame.")),
                "image/jpeg",
                0.85
            );
        });

        const formData = new FormData();
        formData.append("file", blob, "camera.jpg");

        console.log("Sending frame to FastAPI...");

        const response = await fetch(API_URL, {
            method: "POST",
            body: formData
        });

        const responseText = await response.text();

        if (!response.ok) {
            throw new Error(
                `FastAPI error ${response.status}: ${responseText}`
            );
        }

        let result;

        try {
            result = JSON.parse(responseText);
        } catch {
            throw new Error("FastAPI did not return valid JSON: " + responseText);
        }

        console.log("AI result:", result);
        updateMonitoringUI(result);

    } catch (error) {
        console.error("Emotion detection error:", error);
    } finally {
        detectionRequestInProgress = false;
    }
}

/* =====================================================
   LIVE DETECTION LOOP
===================================================== */

async function startLiveDetection() {
    if (liveDetectionRunning || !cameraStream) return;

    liveDetectionRunning = true;
    const loopId = ++detectionLoopId;

    console.log("LIVE AI DETECTION STARTED");

    while (
        liveDetectionRunning &&
        loopId === detectionLoopId &&
        cameraStream &&
        cameraStream.active
    ) {
        await captureAndDetectEmotion();

        if (
            !liveDetectionRunning ||
            loopId !== detectionLoopId ||
            !cameraStream ||
            !cameraStream.active
        ) {
            break;
        }

        const seconds = Number(
            getSafeNestSettings().detectionInterval
        ) || 3;

        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    console.log("AI detection loop stopped.");
}

/* =====================================================
   UPDATE MONITORING UI
===================================================== */

function updateMonitoringUI(result) {
    const emotionElement = document.getElementById("currentEmotion");
    const emotionIcon = document.getElementById("emotionIcon");
    const confidenceElement = document.getElementById("confidenceValue");
    const confidenceFill = document.getElementById("confidenceFill");
    const faceStatus = document.getElementById("faceDetectionStatus");
    const lastDetection = document.getElementById("lastDetection");
    const detectionBox = document.getElementById("detectionBox");
    const detectionBoxText = document.getElementById("detectionBoxText");
    const safetyTitle = document.getElementById("safetyTitle");
    const safetyMessage = document.getElementById("safetyMessage");
    const safetyIcon = document.getElementById("safetyIcon");

    const emotion = result.emotion || "Unknown";
    // Play an alarm when Fear is detected
if (emotion.trim().toLowerCase() === "fear") {
    playFearAlarm();
} else {
    stopFearAlarm();
}
    const confidence = Math.max(
        0,
        Math.min(100, Number(result.confidence) || 0)
    );

    const icons = {
        "Happy": "😊",
        "Sad": "😢",
        "Angry": "😠",
        "Fear": "😨",
        "Disgust": "🤢",
        "Surprise": "😮",
        "Neutral": "😐",
        "No Face": "👤",
        "Unknown": "🙂"
    };

    if (emotionElement) emotionElement.textContent = emotion;
    if (emotionIcon) emotionIcon.textContent = icons[emotion] || "🙂";

    if (confidenceElement) {
        confidenceElement.textContent = confidence.toFixed(1) + "%";
    }

    if (confidenceFill) {
        confidenceFill.style.width = confidence + "%";
    }

    const faceDetected = result.face_detected === true;

    if (faceStatus) {
        faceStatus.textContent = faceDetected ? "Detected" : "Not Detected";
        faceStatus.classList.toggle("monitoring-success", faceDetected);
    }

    if (detectionBox) {
        detectionBox.style.display = faceDetected ? "block" : "none";
    }

    if (detectionBoxText) {
        detectionBoxText.textContent = faceDetected ? "Face Detected" : "No Face";
    }

    if (lastDetection) {
        lastDetection.textContent = new Date().toLocaleTimeString();
    }

    if (result.safety_status === "Alert") {
        if (safetyTitle) safetyTitle.textContent = "Attention Required";
        if (safetyMessage) {
            safetyMessage.textContent =
                "An emotion-based alert was reported. Please check the child.";
        }
        if (safetyIcon) {
            safetyIcon.innerHTML =
                '<i class="bi bi-exclamation-triangle-fill"></i>';
        }
    } else if (result.safety_status === "Safe") {
        if (safetyTitle) safetyTitle.textContent = "Child is Safe";
        if (safetyMessage) {
            safetyMessage.textContent =
                "No alert was reported by the current detection.";
        }
        if (safetyIcon) {
            safetyIcon.innerHTML = '<i class="bi bi-check-lg"></i>';
        }
    } else {
        if (safetyTitle) safetyTitle.textContent = "Monitoring";
        if (safetyMessage) {
            safetyMessage.textContent =
                faceDetected
                    ? "Face detected. Continue monitoring."
                    : "Waiting for a face to be detected.";
        }
    }
}

/* =====================================================
   MICROPHONE BUTTON
   Requests microphone access only when enabled.
===================================================== */

function updateMicrophoneButton(isOn) {
    if (!micBtn) return;

    const icon = micBtn.querySelector("i");

    if (icon) {
        icon.classList.toggle("bi-mic-fill", isOn);
        icon.classList.toggle("bi-mic-mute-fill", !isOn);
    }

    micBtn.title = isOn ? "Turn microphone off" : "Turn microphone on";
}

if (micBtn) {
    updateMicrophoneButton(false);

    micBtn.addEventListener("click", async (event) => {
        event.preventDefault();

        if (microphoneStream) {
            microphoneStream.getTracks().forEach(track => track.stop());
            microphoneStream = null;
            microphoneEnabled = false;
            updateMicrophoneButton(false);
            return;
        }

        try {
            microphoneStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });

            microphoneEnabled = true;
            updateMicrophoneButton(true);
            console.log("Microphone enabled.");
        } catch (error) {
            console.error("Microphone error:", error);
            alert("Microphone access failed. Check your browser permission.");
            updateMicrophoneButton(false);
        }
    });
}

/* =====================================================
   FULLSCREEN
===================================================== */

if (fullscreenBtn && cameraScreen) {
    fullscreenBtn.addEventListener("click", async (event) => {
        event.preventDefault();

        try {
            if (!document.fullscreenElement) {
                await cameraScreen.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (error) {
            console.error("Fullscreen error:", error);
        }
    });
}

/* =====================================================
   EMERGENCY MODAL
===================================================== */

const emergencyBtn = document.getElementById("emergencyBtn");
const emergencyModal = document.getElementById("emergencyModal");
const cancelEmergency = document.getElementById("cancelEmergency");
const confirmEmergency = document.getElementById("confirmEmergency");

if (emergencyBtn && emergencyModal) {
    emergencyBtn.addEventListener("click", () => {
        emergencyModal.classList.add("show");
    });
}

if (cancelEmergency && emergencyModal) {
    cancelEmergency.addEventListener("click", () => {
        emergencyModal.classList.remove("show");
    });
}

if (confirmEmergency && emergencyModal) {
    confirmEmergency.addEventListener("click", () => {
        emergencyModal.classList.remove("show");

        // This is a local demonstration only. Connect a real
        // notification service before claiming an alert was sent.
        alert("Demo only: connect an emergency notification backend to send a real alert.");
    });
}

if (emergencyModal) {
    emergencyModal.addEventListener("click", event => {
        if (event.target === emergencyModal) {
            emergencyModal.classList.remove("show");
        }
    });
}

/* =====================================================
   INITIALIZE MONITORING PAGE
===================================================== */

if (video) {
    console.log("SafeNest monitoring page loaded.");

    updateCameraButton(false);

    // Start the camera when this page loads.
    window.addEventListener("load", () => {
        startSafeNestCamera();
    });

    // If the camera is disconnected or permission is revoked,
    // stop the detection loop and reset the controls.
    video.addEventListener("error", () => {
        stopSafeNestCamera();
    });
}

// Release camera and microphone resources when leaving the page.
window.addEventListener("pagehide", () => {
    stopSafeNestCamera();
});



/* =====================================================
   DASHBOARD: LOAD EMOTION SUMMARY AND RECENT ALERTS
===================================================== */

async function loadDashboardData() {
    try {
        // Load saved emotion records from FastAPI
        const response = await fetch("http://127.0.0.1:8000/emotions");

        if (!response.ok) {
            throw new Error("Could not load emotion history.");
        }

        const data = await response.json();

        // Support either a direct array or an object containing records
        const records = Array.isArray(data)
            ? data
            : data.emotions || data.records || [];

        if (!Array.isArray(records)) {
            throw new Error("Unexpected emotion history format.");
        }

        // Count today's emotion records
        const today = new Date().toLocaleDateString("en-CA");
        const todayRecords = records.filter(record => {
            if (!record.timestamp) return false;

            const recordDate = record.timestamp.slice(0, 10);
            return recordDate === today;
        });

        const emotionNames = ["Happy", "Neutral", "Sad", "Fear"];
        const total = todayRecords.length;

        emotionNames.forEach(emotion => {
            const count = todayRecords.filter(
                record => record.emotion?.toLowerCase() === emotion.toLowerCase()
            ).length;

            const percent = total > 0
                ? Math.round((count / total) * 100)
                : 0;

            const key = emotion.toLowerCase();
            const bar = document.getElementById(key + "Bar");
            const label = document.getElementById(key + "Percent");

            if (bar) bar.style.width = percent + "%";
            if (label) label.textContent = percent + "%";
        });

        // Load alert count if the dashboard has this element
        const countElement = document.getElementById("todayAlertCount");

        try {
            const alertResponse = await fetch(
                "http://127.0.0.1:8000/alert-count"
            );

            if (alertResponse.ok) {
                const alertData = await alertResponse.json();

                if (countElement) {
                    const count = typeof alertData === "number"
                        ? alertData
                        : alertData.count ?? alertData.alert_count ?? 0;

                    countElement.textContent = count;
                }
            }
        } catch (error) {
            console.error("Could not load alert count:", error);
        }

        // Display records marked as alerts
        const alertsContainer = document.getElementById("recentAlerts");

        if (alertsContainer) {
            const alerts = records
                .filter(record =>
                    record.alert &&
                    record.alert.toLowerCase() !== "no alert"
                )
                .slice(0, 5);

            if (alerts.length === 0) {
                alertsContainer.innerHTML =
                    "<p>No recent alerts found.</p>";
            } else {
                alertsContainer.innerHTML = alerts.map(record => `
                    <div class="alert-item">
                        <div>
                            <strong>${record.emotion || "Emotion"} detected</strong>
                            <p>${record.timestamp || ""} · ${record.confidence ?? "--"}% confidence</p>
                        </div>
                        <span class="alert-status">Alert</span>
                    </div>
                `).join("");
            }
        }

        console.log("Dashboard data loaded:", records.length, "records");

    } catch (error) {
        console.error("Dashboard data error:", error);
    }
}

// Load dashboard data only when its elements exist.
if (
    document.getElementById("happyBar") ||
    document.getElementById("recentAlerts")
) {
    loadDashboardData();
}