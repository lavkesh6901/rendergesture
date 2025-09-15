const video = document.getElementById('video');
const resultEl = document.getElementById('result');
const iconEl = document.getElementById('gesture-icon');
const confidenceBar = document.getElementById('confidence-bar');
const confidenceLabel = document.getElementById('confidence-label');

const voiceSelect = document.getElementById('voiceSelect');
const volumeSlider = document.getElementById('volume');
const pitchSlider = document.getElementById('pitch');
const rateSlider = document.getElementById('rate');
const statsEl = document.getElementById('stats');

const serverStatusEl = document.getElementById('server-status');
const themeToggle = document.getElementById('themeToggle');
const highContrastToggle = document.getElementById('highContrastToggle');
const intervalSlider = document.getElementById('interval');
const intervalValue = document.getElementById('intervalValue');
const speakToggle = document.getElementById('speakToggle');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const handDetectedEl = document.getElementById('handDetected');

let predictionCounts = {};
let lastSpoken = "";
let captureTimer = null;
let lastLatencyMs = null;

// Gesture mapping with emojis
const gestureMap = {
  '0': { label: 'Bad', emoji: '👎' },
  '1': { label: 'For', emoji: '👉' },
  '2': { label: 'Good', emoji: '👍' },
  '3': { label: 'Hello', emoji: '👋' },
  '4': { label: 'Help', emoji: '🆘' },
  '5': { label: 'Like', emoji: '❤️' },
  '6': { label: 'Me', emoji: '👇' },
  '7': { label: 'No', emoji: '🙅' },
  '8': { label: 'Okay', emoji: '👌' },
  '9': { label: 'Thanks', emoji: '🙏' },
  '10': { label: 'Worry', emoji: '😟' },
  '11': { label: 'Yes', emoji: '🙆' },
  '12': { label: 'You', emoji: '👆' }
};

const DEFAULT_URL = 'http://localhost:5000/predict';
intervalSlider.value = Number(localStorage.getItem('intervalMs') || 1000);
intervalValue.textContent = `${intervalSlider.value} ms`;

// Initialize theme
function setTheme(mode) {
  if (mode === 'light') document.documentElement.classList.add('light');
  else document.documentElement.classList.remove('light');
  localStorage.setItem('theme', mode);
}

setTheme(localStorage.getItem('theme') || 'dark');

// Initialize high contrast mode
function setHighContrastMode(enabled) {
  if (enabled) document.documentElement.classList.add('high-contrast');
  else document.documentElement.classList.remove('high-contrast');
  localStorage.setItem('highContrast', enabled);
}

setHighContrastMode(localStorage.getItem('highContrast') === 'true');
highContrastToggle.checked = localStorage.getItem('highContrast') === 'true';

// Theme toggle
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.classList.contains('light') ? 'dark' : 'light';
  setTheme(next);
});

// High contrast toggle
highContrastToggle.addEventListener('change', (e) => {
  setHighContrastMode(e.target.checked);
});

// Interval slider
intervalSlider.addEventListener('input', () => {
  intervalValue.textContent = `${intervalSlider.value} ms`;
  localStorage.setItem('intervalMs', intervalSlider.value);
  if (captureTimer) restartCapture();
});

// Start/stop buttons
startBtn.addEventListener('click', startCapture);
stopBtn.addEventListener('click', stopCapture);

// Training gestures toggle
document.querySelectorAll('.training-gesture').forEach(item => {
  item.addEventListener('click', function() {
    const steps = this.nextElementSibling;
    steps.classList.toggle('active');
  });
});

function startCapture() {
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream;
      video.play();
      video.classList.add('active');
      startBtn.disabled = true;
      stopBtn.disabled = false;
      serverStatusEl.textContent = "Connecting...";
      serverStatusEl.className = "badge badge-warning";

      predictionCounts = {};
      updateStats();

      captureTimer = setInterval(captureAndSend, intervalSlider.value);
    })
    .catch(err => {
      alert("Camera error: " + err.message);
    });
}

function stopCapture() {
  if (captureTimer) clearInterval(captureTimer);
  captureTimer = null;

  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
  }
  video.srcObject = null;
  video.classList.remove('active');

  startBtn.disabled = false;
  stopBtn.disabled = true;
  serverStatusEl.textContent = "Offline";
  serverStatusEl.className = "badge";

  resetPredictionDisplay();
  handDetectedEl.classList.remove('active');
  resetEmojiDisplay();
}

function restartCapture() {
  stopCapture();
  startCapture();
}

function captureAndSend() {
  if (!video.videoWidth) return;
  
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

  const start = performance.now();

  fetch(DEFAULT_URL, {
    method: 'POST',
    body: JSON.stringify({ image: dataUrl }),
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then(res => {
      if (!res.ok) throw new Error('Network response not OK');
      return res.json();
    })
    .then(data => {
      lastLatencyMs = performance.now() - start;
      serverStatusEl.textContent = `Online (${Math.round(lastLatencyMs)} ms)`;
      serverStatusEl.className = "badge badge-success";

      // Use the numeric prediction directly (0-12)
      const prediction = data.prediction;
      const confidence = data.confidence || 0;

      // Update counts
      predictionCounts[prediction] = (predictionCounts[prediction] || 0) + 1;
      updateStats();

      // Update UI
      updatePrediction(prediction, confidence);
      updateHandDetection(prediction);
      updateEmojiDisplay(prediction);

      if (speakToggle.checked && prediction !== lastSpoken) {
        speakPrediction(prediction);
        lastSpoken = prediction;
      }
    })
    .catch(err => {
      serverStatusEl.textContent = `Error: ${err.message}`;
      serverStatusEl.className = "badge badge-error";
    });
}

function updatePrediction(prediction, confidence) {
  const gesture = gestureMap[prediction] || { label: 'Unknown', emoji: '❓' };
  
  iconEl.textContent = gesture.emoji;
  resultEl.textContent = gesture.label;

  const percent = Math.round(confidence * 100);
  confidenceBar.style.width = percent + '%';
  confidenceLabel.textContent = percent + '%';

  // Add animation for high confidence
  if (percent > 75) {
    iconEl.classList.add('active');
  } else {
    iconEl.classList.remove('active');
  }
}

function updateHandDetection(prediction) {
  if (prediction !== "unknown" && gestureMap[prediction]) {
    handDetectedEl.classList.add('active');
    handDetectedEl.innerHTML = `✋ ${gestureMap[prediction].emoji} ${gestureMap[prediction].label} Detected`;
  } else {
    handDetectedEl.classList.remove('active');
  }
}

function updateEmojiDisplay(prediction) {
  // Reset all emojis
  resetEmojiDisplay();
  
  // Highlight the detected emoji
  if (prediction !== "unknown" && gestureMap[prediction]) {
    const emojiItem = document.querySelector(`.emoji-item[data-gesture="${prediction}"]`);
    if (emojiItem) {
      emojiItem.classList.add('active');
    }
  }
}

function resetEmojiDisplay() {
  document.querySelectorAll('.emoji-item').forEach(item => {
    item.classList.remove('active');
  });
}

function resetPredictionDisplay() {
  iconEl.textContent = '❓';
  resultEl.textContent = 'Waiting...';
  confidenceBar.style.width = '0%';
  confidenceLabel.textContent = '0%';
  iconEl.classList.remove('active');
}

function updateStats() {
  let statsText = '';
  for (const [key, val] of Object.entries(predictionCounts)) {
    const gesture = gestureMap[key] || { label: 'Unknown' };
    statsText += `${gesture.label}: ${val}\n`;
  }
  statsEl.textContent = statsText || 'No data yet.';
}

function speakPrediction(prediction) {
  if (!window.speechSynthesis) return;

  const gesture = gestureMap[prediction] || { label: 'Unknown' };
  const utterance = new SpeechSynthesisUtterance(gesture.label);
  utterance.volume = parseFloat(volumeSlider.value);
  utterance.pitch = parseFloat(pitchSlider.value);
  utterance.rate = parseFloat(rateSlider.value);

  const selectedVoiceName = voiceSelect.value;
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(v => v.name === selectedVoiceName);
  if (voice) utterance.voice = voice;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function populateVoices() {
  const voices = window.speechSynthesis.getVoices();
  voiceSelect.innerHTML = '';
  voices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  const savedVoice = localStorage.getItem('voiceName');
  if (savedVoice) voiceSelect.value = savedVoice;
}

// Create emoji display
function createEmojiDisplay() {
  const emojiDisplay = document.getElementById('emojiDisplay');
  emojiDisplay.innerHTML = '';
  
  for (const [key, value] of Object.entries(gestureMap)) {
    const emojiItem = document.createElement('div');
    emojiItem.className = 'emoji-item';
    emojiItem.dataset.gesture = key;
    emojiItem.innerHTML = `
      <div class="symbol">${value.emoji}</div>
      <div class="label">${value.label}</div>
    `;
    emojiDisplay.appendChild(emojiItem);
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !e.repeat) { // Spacebar to start/stop
    if (startBtn.disabled) {
      stopCapture();
    } else {
      startCapture();
    }
    e.preventDefault();
  }
  
  if (e.key === 't' || e.key === 'T') { // T to toggle theme
    const next = document.documentElement.classList.contains('light') ? 'dark' : 'light';
    setTheme(next);
  }
  
  if (e.key === 's' || e.key === 'S') { // S to toggle speech
    speakToggle.checked = !speakToggle.checked;
  }
});

// Initialize
populateVoices();
createEmojiDisplay();

// Restore settings
(function restoreSettings() {
  const vol = localStorage.getItem('volume');
  if (vol) volumeSlider.value = vol;
  const pit = localStorage.getItem('pitch');
  if (pit) pitchSlider.value = pit;
  const rate = localStorage.getItem('rate');
  if (rate) rateSlider.value = rate;
  
  // Set up event listeners for saving settings
  voiceSelect.addEventListener('change', () => {
    localStorage.setItem('voiceName', voiceSelect.value);
  });

  volumeSlider.addEventListener('input', () => {
    localStorage.setItem('volume', volumeSlider.value);
  });

  pitchSlider.addEventListener('input', () => {
    localStorage.setItem('pitch', pitchSlider.value);
  });

  rateSlider.addEventListener('input', () => {
    localStorage.setItem('rate', rateSlider.value);
  });
})();

// Speech synthesis voices loaded
window.speechSynthesis.onvoiceschanged = populateVoices;