# Captionly
Add captions to your videos using local AI entirely in your browser. Upload a video, edit and style captions live, then export a captioned video or SRT — no uploads, login, servers, or API keys.
[![Captionly preview](preview.webp)](https://0shuvo0.github.io/Captionly/)

### Features
- AI transcription with word-level timestamps
- Live caption styling (font, color, size, position, background, etc.)
- Edit captions without re-transcribing
- Export burned-in captions or SRT subtitles

### How it works
- Upload a video.
- Audio is extracted and transcribed locally using Whisper via transformers.js.
- Style or edit captions in real time.
- Export the captioned video or an SRT file.

# Notes
- Everything runs locally — your video never leaves your device.
- Models are downloaded once and cached by your browser.
- Larger models are slower but produce more accurate captions.
- MP4 export works best in Chromium-based browsers.