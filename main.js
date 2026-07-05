// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  file: null,
  url: null,
  duration: 0,
  words: [],      // [{text, start, end}]
  lines: [],      // [{text, start, end, words:[{text,start,end}]}]
  transcriber: null,
  currentModelId: null,
  style: {
    mode: 'line',
    position: 'bottom',
    fontFamily: "'Inter', sans-serif",
    weight: '700',
    fontSize: 28,       // px at reference height 720
    textColor: '#ffffff',
    activeColor: '#ff7a50',
    bgColor: '#000000',
    bgOpacity: 65,
    padding: 10,        // px at reference height 720
    radius: 8,           // px at reference height 720
    maxWidth: 80,        // % of video width
    offset: 6,            // % of video height, distance from top/bottom edge
    outline: true,
  },
};

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const dropzone = $('dropzone');
const fileInput = $('fileInput');
const stage = $('stage');
const videoWrap = $('videoWrap');
const video = $('video');
const captionLayer = $('captionLayer');
const captionBox = $('captionBox');
const loader = $('loader');
const loaderText = $('loaderText');
const loaderSub = $('loaderSub');
const loaderProgress = $('loaderProgress');
const generateBtn = $('generateBtn');
const downloadBtn = $('downloadBtn');
const changeBtn = $('changeBtn');
const statusLine = $('statusLine');
const fileMeta = $('fileMeta');
const modelSizeSel = $('modelSize');
const timelineTrack = $('timelineTrack');
const timelineEmpty = $('timelineEmpty');
const playhead = $('playhead');
const timelineTime = $('timelineTime');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtTime(s){
  if(!isFinite(s) || s<0) s=0;
  const m = Math.floor(s/60);
  const sec = Math.floor(s%60);
  return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
}
function hexToRgba(hex, pct){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${(pct/100).toFixed(2)})`;
}
function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function showLoader(text, sub=''){
  loaderText.textContent = text;
  loaderSub.textContent = sub;
  loaderProgress.style.width = '0%';
  loader.classList.add('show');
}
function setLoaderProgress(pct){
  loaderProgress.style.width = Math.max(0,Math.min(100,pct)) + '%';
}
function hideLoader(){ loader.classList.remove('show'); }
function setStatus(msg, isError=false){
  statusLine.textContent = msg || '';
  statusLine.classList.toggle('error', !!isError);
}

// ---------------------------------------------------------------------------
// Upload handling
// ---------------------------------------------------------------------------
dropzone.addEventListener('click', () => fileInput.click());
changeBtn.addEventListener('click', () => fileInput.click());
['dragover','dragenter'].forEach(ev => dropzone.addEventListener(ev, (e)=>{ e.preventDefault(); dropzone.style.borderColor = 'var(--accent)'; }));
['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, (e)=>{ e.preventDefault(); }));
dropzone.addEventListener('drop', (e)=>{
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if(f) loadFile(f);
});
fileInput.addEventListener('change', (e)=>{
  const f = e.target.files && e.target.files[0];
  if(f) loadFile(f);
});

function loadFile(file){
  if(!file.type.startsWith('video/')){
    setStatus('Please choose a video file.', true);
    return;
  }
  state.file = file;
  if(state.url) URL.revokeObjectURL(state.url);
  state.url = URL.createObjectURL(file);
  video.src = state.url;

  dropzone.style.display = 'none';
  videoWrap.style.display = '';
  stage.classList.add('has-video');
  changeBtn.style.display = '';
  generateBtn.disabled = false;
  downloadBtn.disabled = true;
  setStatus('');
  state.words = [];
  state.lines = [];
  renderTimelineSegments();

  video.onloadedmetadata = () => {
    state.duration = video.duration;
    fileMeta.textContent = `${file.name} · ${fmtTime(video.duration)} · ${video.videoWidth}×${video.videoHeight}`;
    applyCaptionVars();
  };
}

// ---------------------------------------------------------------------------
// Style controls -> live CSS variables on the preview overlay
// ---------------------------------------------------------------------------
function refScale(){
  const h = video.clientHeight || 405;
  return h/720;
}
function applyCaptionVars(){
  const s = state.style;
  const scale = refScale();
  const videoH = video.clientHeight || 405;
  captionLayer.className = 'caption-layer pos-' + s.position;
  captionLayer.style.paddingTop = (s.position === 'top') ? (s.offset/100*videoH) + 'px' : '0px';
  captionLayer.style.paddingBottom = (s.position === 'bottom') ? (s.offset/100*videoH) + 'px' : '0px';
  captionBox.style.setProperty('--cap-maxwidth', s.maxWidth + '%');
  captionBox.style.setProperty('--cap-pad', (s.padding*scale) + 'px');
  captionBox.style.setProperty('--cap-radius', (s.radius*scale) + 'px');
  captionBox.style.setProperty('--cap-bg', hexToRgba(s.bgColor, s.bgOpacity));
  captionBox.style.setProperty('--cap-color', s.textColor);
  captionBox.style.setProperty('--cap-active', s.activeColor);
  captionBox.style.setProperty('--cap-font', s.fontFamily);
  captionBox.style.setProperty('--cap-size', (s.fontSize*scale) + 'px');
  captionBox.style.setProperty('--cap-weight', s.weight);
  captionBox.style.setProperty('--cap-shadow', s.outline ? '0 0 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)' : 'none');
  $('offsetField').style.display = (s.position === 'middle') ? 'none' : '';
  updateOverlay(video.currentTime || 0);
}
window.addEventListener('resize', applyCaptionVars);

function bindSeg(id, key, onChange){
  const seg = $(id);
  seg.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      seg.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.style[key] = btn.dataset.val;
      applyCaptionVars();
      if(onChange) onChange();
    });
  });
}
bindSeg('modeSeg', 'mode');
bindSeg('posSeg', 'position');
bindSeg('weightSeg', 'weight');

$('fontFamily').addEventListener('change', (e)=>{ state.style.fontFamily = e.target.value; applyCaptionVars(); });

function bindRange(id, key, suffix, valId, transform){
  const el = $(id);
  el.addEventListener('input', ()=>{
    const v = transform ? transform(el.value) : Number(el.value);
    state.style[key] = v;
    if(valId) $(valId).textContent = el.value + suffix;
    applyCaptionVars();
  });
}
bindRange('fontSize','fontSize','px','fontSizeVal');
bindRange('bgOpacity','bgOpacity','%','bgOpacityVal');
bindRange('padding','padding','px','paddingVal');
bindRange('radius','radius','px','radiusVal');
bindRange('maxWidth','maxWidth','%','maxWidthVal');
bindRange('offset','offset','%','offsetVal');

function bindColor(id, key, hexId){
  const el = $(id);
  el.addEventListener('input', ()=>{
    state.style[key] = el.value;
    $(hexId).textContent = el.value.toUpperCase();
    applyCaptionVars();
  });
}
bindColor('textColor','textColor','textColorHex');
bindColor('activeColor','activeColor','activeColorHex');
bindColor('bgColor','bgColor','bgColorHex');

$('outline').addEventListener('change', (e)=>{ state.style.outline = e.target.checked; applyCaptionVars(); });

// ---------------------------------------------------------------------------
// Overlay rendering during playback
// ---------------------------------------------------------------------------
function updateOverlay(t){
  if(!state.lines.length){ captionBox.innerHTML = ''; return; }
  if(state.style.mode === 'word'){
    const w = state.words.find(w => t >= w.start && t < w.end);
    captionBox.textContent = w ? w.text.trim() : '';
  } else {
    const line = state.lines.find(l => t >= l.start && t < l.end);
    if(!line){ captionBox.innerHTML = ''; return; }
    captionBox.innerHTML = line.words.map(w=>{
      const active = (t >= w.start && t < w.end);
      return `<span class="${active?'active':''}">${escapeHtml(w.text.trim())}</span>`;
    }).join(' ');
  }
}

video.addEventListener('timeupdate', ()=>{
  updateOverlay(video.currentTime);
  const pct = state.duration ? (video.currentTime/state.duration)*100 : 0;
  playhead.style.left = pct + '%';
  timelineTime.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(state.duration)}`;

  if(!video.paused && state.lines.length){
    const trackWidth = timelineTrack.clientWidth;
    const viewWidth = timelineScroll.clientWidth;
    const playheadPx = (pct/100)*trackWidth;
    const scrollLeft = timelineScroll.scrollLeft;
    const margin = 24;
    if(playheadPx < scrollLeft + margin || playheadPx > scrollLeft + viewWidth - margin){
      const target = Math.max(0, Math.min(trackWidth - viewWidth, playheadPx - viewWidth/2));
      timelineScroll.scrollLeft = target;
    }
  }
});
video.addEventListener('play', ()=>{});

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
const timelineScroll = $('timelineScroll');
const PX_PER_SECOND = 70;

function renderTimelineSegments(){
  timelineTrack.querySelectorAll('.timeline-seg').forEach(n=>n.remove());
  if(!state.lines.length){
    timelineEmpty.textContent = 'Generate captions to see the caption track here.';
    timelineTrack.style.width = '';
    return;
  }
  timelineEmpty.textContent = 'Click a segment to jump there, double-click to edit its text.';
  const dur = state.duration || 1;
  const trackWidth = Math.max(timelineScroll.clientWidth, dur*PX_PER_SECOND);
  timelineTrack.style.width = trackWidth + 'px';
  state.lines.forEach((line, idx)=>{
    const seg = document.createElement('div');
    seg.className = 'timeline-seg';
    seg.style.left = (line.start/dur*100) + '%';
    seg.style.width = Math.max(0.3,(line.end-line.start)/dur*100) + '%';
    seg.title = `${line.text}  ·  click to preview, double-click to edit`;
    seg.addEventListener('click', (e)=>{
      e.stopPropagation();
      video.currentTime = line.start;
    });
    seg.addEventListener('dblclick', (e)=>{
      e.stopPropagation();
      openEditModal(idx);
    });
    timelineTrack.appendChild(seg);
  });
}
timelineTrack.addEventListener('click', (e)=>{
  if(!state.duration) return;
  const rect = timelineTrack.getBoundingClientRect();
  const pct = (e.clientX-rect.left)/rect.width;
  video.currentTime = pct*state.duration;
});

// ---------------------------------------------------------------------------
// Edit caption text
// ---------------------------------------------------------------------------
const editBackdrop = $('editBackdrop');
const editInput = $('editInput');
const editTime = $('editTime');
let editingIndex = null;

function openEditModal(index){
  const line = state.lines[index];
  if(!line) return;
  editingIndex = index;
  editTime.textContent = `${fmtTime(line.start)} – ${fmtTime(line.end)}`;
  editInput.value = line.text;
  editBackdrop.classList.add('show');
  video.pause();
  requestAnimationFrame(()=>{ editInput.focus(); editInput.select(); });
}
function closeEditModal(){
  editBackdrop.classList.remove('show');
  editingIndex = null;
}
function saveEditedLine(){
  if(editingIndex == null) return;
  const line = state.lines[editingIndex];
  const wordStrings = editInput.value.trim().split(/\s+/).filter(Boolean);
  if(!wordStrings.length){
    editInput.focus();
    return;
  }
  const totalDur = Math.max(0.05, line.end - line.start);
  const step = totalDur / wordStrings.length;
  const newWords = wordStrings.map((w,i)=>({
    text: w,
    start: line.start + i*step,
    end: line.start + (i+1)*step,
  }));

  // Keep the flat word list (used for word-by-word mode) in sync: swap the
  // old words belonging to this line for the newly typed ones.
  const oldFirst = line.words[0];
  const idx = state.words.indexOf(oldFirst);
  if(idx !== -1){
    state.words.splice(idx, line.words.length, ...newWords);
  }

  line.words = newWords;
  line.text = wordStrings.join(' ');

  renderTimelineSegments();
  updateOverlay(video.currentTime);
  setStatus('Caption line updated.');
  closeEditModal();
}

$('editClose').addEventListener('click', closeEditModal);
$('editCancel').addEventListener('click', closeEditModal);
$('editSave').addEventListener('click', saveEditedLine);
editBackdrop.addEventListener('click', (e)=>{ if(e.target === editBackdrop) closeEditModal(); });
editInput.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){ e.preventDefault(); saveEditedLine(); }
  else if(e.key === 'Escape'){ e.preventDefault(); closeEditModal(); }
});

// ---------------------------------------------------------------------------
// Audio extraction (decode + resample to 16kHz mono Float32)
// ---------------------------------------------------------------------------
async function extractAudioFloat32(file){
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const tmpCtx = new AudioCtx();
  let decoded;
  try{
    decoded = await tmpCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    tmpCtx.close();
  }
  const targetRate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration*targetRate), targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

// ---------------------------------------------------------------------------
// Transcription via transformers.js (Whisper, ONNX, runs in-browser)
// ---------------------------------------------------------------------------
let transformersModule = null;
async function getTransformers(){
  if(!transformersModule){
    transformersModule = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm');
    transformersModule.env.allowLocalModels = false;
  }
  return transformersModule;
}

async function ensureTranscriber(modelId, onProgress){
  if(state.transcriber && state.currentModelId === modelId) return state.transcriber;
  const { pipeline } = await getTransformers();
  const seen = {};
  state.transcriber = await pipeline('automatic-speech-recognition', modelId, {
    progress_callback: (data)=>{
      if(data.status === 'progress' && data.file){
        seen[data.file] = data.progress || 0;
        const files = Object.keys(seen);
        const avg = files.reduce((a,f)=>a+seen[f],0)/files.length;
        onProgress(avg, data.file);
      }
    }
  });
  state.currentModelId = modelId;
  return state.transcriber;
}

function groupWordsIntoLines(words, maxChars=42, maxWords=9, pauseGap=0.7){
  const lines = [];
  let cur = [];
  let curChars = 0;
  for(let i=0;i<words.length;i++){
    const w = words[i];
    const gap = cur.length ? (w.start - cur[cur.length-1].end) : 0;
    const prevText = cur.length ? cur[cur.length-1].text.trim() : '';
    const endsSentence = /[.!?]$/.test(prevText);
    if(cur.length && (curChars + w.text.length > maxChars || cur.length >= maxWords || gap > pauseGap || endsSentence)){
      lines.push(finalizeLine(cur));
      cur = []; curChars = 0;
    }
    cur.push(w);
    curChars += w.text.length + 1;
  }
  if(cur.length) lines.push(finalizeLine(cur));
  return lines;
}
function finalizeLine(words){
  return {
    text: words.map(w=>w.text.trim()).join(' ').replace(/\s+([,.!?])/g,'$1'),
    start: words[0].start,
    end: words[words.length-1].end,
    words,
  };
}

const MODEL_LABELS = {
  'Xenova/whisper-tiny.en': 'Tiny',
  'Xenova/whisper-base.en': 'Base',
  'Xenova/whisper-small.en': 'Small',
  'Xenova/whisper-medium.en': 'Medium',
  'Xenova/whisper-large-v3': 'Large',
};

async function generateCaptions(){
  if(!state.file) return;
  const modelId = modelSizeSel.value;
  if(/medium|large/.test(modelId)){
    const proceed = confirm(
      `The ${MODEL_LABELS[modelId]} model is a large download and can be slow to run, especially on phones or older machines. ` +
      `It's cached after the first download, but that first run may take a while. Continue?`
    );
    if(!proceed) return;
  }
  generateBtn.disabled = true;
  downloadBtn.disabled = true;
  setStatus('');
  try{
    showLoader('Extracting audio…', 'Decoding the audio track from your video');
    setLoaderProgress(8);
    const audioData = await extractAudioFloat32(state.file);

    showLoader(`Loading transcriber AImodel…`, 'First run downloads the model — your browser caches it after that');
    const transcriber = await ensureTranscriber(modelId, (pct, file)=>{
      setLoaderProgress(pct);
      loaderSub.textContent = `Downloading ${file || 'model files'}… ${Math.round(pct)}%`;
    });

    showLoader('Transcribing speech…', 'Running Whisper locally on your audio — larger videos take longer');
    setLoaderProgress(15);
    const output = await transcriber(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: 'word',
    });
    setLoaderProgress(95);

    const rawWords = (output.chunks || [])
      .filter(c => c.timestamp && c.timestamp[0] != null && c.timestamp[1] != null && c.text && c.text.trim())
      .map(c => ({ text: c.text, start: c.timestamp[0], end: Math.max(c.timestamp[1], c.timestamp[0]+0.05) }));

    if(!rawWords.length){
      throw new Error('No speech detected in this video.');
    }

    state.words = rawWords;
    state.lines = groupWordsIntoLines(rawWords);
    renderTimelineSegments();

    // Jump to the first caption so it's visible right away, and so any
    // style tweak the user makes next shows up instantly without pressing play.
    video.currentTime = Math.max(0, state.lines[0].start - 0.05);
    applyCaptionVars();
    updateOverlay(video.currentTime);
    downloadBtn.disabled = false;
    setLoaderProgress(100);
    setStatus(`Captioned ${state.lines.length} lines · ${state.words.length} words`);
  } catch(err){
    console.error(err);
    setStatus(err.message || 'Something went wrong generating captions.', true);
  } finally{
    hideLoader();
    generateBtn.disabled = false;
  }
}
generateBtn.addEventListener('click', generateCaptions);

// ---------------------------------------------------------------------------
// Canvas caption drawing (shared logic used for export)
// ---------------------------------------------------------------------------
function roundRectPath(ctx,x,y,w,h,r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}
function wrapWords(ctx, words, maxWidth, spaceWidth){
  const lines = [];
  let cur = [];
  let curWidth = 0;
  for(const w of words){
    const width = ctx.measureText(w.text).width;
    if(cur.length && (curWidth + spaceWidth + width) > maxWidth){
      lines.push(cur);
      cur = []; curWidth = 0;
    }
    cur.push({...w, width});
    curWidth += width + spaceWidth;
  }
  if(cur.length) lines.push(cur);
  return lines;
}
function drawCaptionOnCanvas(ctx, t, canvasW, canvasH){
  const s = state.style;
  const scale = canvasH/720;
  const fontSize = s.fontSize*scale;
  ctx.font = `${s.weight} ${fontSize}px ${s.fontFamily}`;
  ctx.textBaseline = 'middle';

  let words;
  if(s.mode === 'word'){
    const w = state.words.find(w => t>=w.start && t<w.end);
    words = w ? [{text:w.text.trim(), active:true}] : [];
  } else {
    const line = state.lines.find(l => t>=l.start && t<l.end);
    words = line ? line.words.map(w=>({text:w.text.trim(), active:(t>=w.start&&t<w.end)})) : [];
  }
  if(!words.length) return;

  const spaceWidth = ctx.measureText(' ').width;
  const maxWidth = canvasW*(s.maxWidth/100) - (s.padding*scale*2);
  const wrapped = wrapWords(ctx, words, Math.max(40,maxWidth), spaceWidth);
  const lineHeight = fontSize*1.35;
  const padding = s.padding*scale;
  const boxHeight = wrapped.length*lineHeight + padding*2;

  let maxLineWidth = 0;
  wrapped.forEach(line=>{
    let w=0; line.forEach((word,i)=>{ w+=word.width; if(i<line.length-1) w+=spaceWidth; });
    maxLineWidth = Math.max(maxLineWidth, w);
  });
  const boxWidth = Math.min(canvasW*(s.maxWidth/100), maxLineWidth + padding*2);

  let boxY;
  if(s.position === 'top') boxY = canvasH*(s.offset/100);
  else if(s.position === 'middle') boxY = canvasH/2 - boxHeight/2;
  else boxY = canvasH*(1 - s.offset/100) - boxHeight;
  const boxX = canvasW/2 - boxWidth/2;

  ctx.fillStyle = hexToRgba(s.bgColor, s.bgOpacity);
  roundRectPath(ctx, boxX, boxY, boxWidth, boxHeight, s.radius*scale);
  ctx.fill();

  let cy = boxY + padding + lineHeight/2;
  wrapped.forEach(line=>{
    let lineWidth = 0;
    line.forEach((word,i)=>{ lineWidth += word.width; if(i<line.length-1) lineWidth += spaceWidth; });
    let cx = canvasW/2 - lineWidth/2;
    line.forEach(word=>{
      ctx.fillStyle = word.active ? s.activeColor : s.textColor;
      if(s.outline){
        ctx.lineWidth = Math.max(2, fontSize*0.09);
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineJoin = 'round';
        ctx.strokeText(word.text, cx, cy);
      }
      ctx.fillText(word.text, cx, cy);
      cx += word.width + spaceWidth;
    });
    cy += lineHeight;
  });
}

// ---------------------------------------------------------------------------
// Export (burn captions into the video and download)
// ---------------------------------------------------------------------------
const FORMATS = {
  mp4:  { ext:'mp4',  mimes:['video/mp4;codecs=h264,aac', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'] },
  webm: { ext:'webm', mimes:['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] },
};
function pickSupportedMime(list){
  for(const m of list){ if(window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; }
  return null;
}

let wakeLock = null;
async function requestWakeLock(){
  try{
    if('wakeLock' in navigator){
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch(err){
    console.warn('Wake Lock unavailable:', err);
  }
}
async function releaseWakeLock(){
  if(wakeLock){
    try{ await wakeLock.release(); } catch(_){}
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', async ()=>{
  if(wakeLock !== null && document.visibilityState === 'visible' && downloadBtn.disabled){
    // Re-acquire if the browser dropped the lock when the tab lost visibility.
    await requestWakeLock();
  }
});

async function exportVideo(formatKey='webm'){
  if(!state.file || !state.lines.length) return;
  downloadBtn.disabled = true;
  generateBtn.disabled = true;
  const wasPaused = video.paused;
  const prevTime = video.currentTime;
  video.pause();

  try{
    await requestWakeLock();
    showLoader('Rendering your video…', "Stay on this tab and don't let your device sleep — playing through once to burn in captions");
    setLoaderProgress(0);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    if(typeof video.captureStream !== 'function' && typeof video.mozCaptureStream !== 'function'){
      throw new Error('Your browser does not support recording video (captureStream unavailable).');
    }
    const audioSourceStream = (video.captureStream || video.mozCaptureStream).call(video);
    const audioTracks = audioSourceStream.getAudioTracks();
    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

    let usedFormatKey = formatKey;
    let mimeType = pickSupportedMime(FORMATS[formatKey].mimes);
    if(!mimeType){
      usedFormatKey = 'webm';
      mimeType = pickSupportedMime(FORMATS.webm.mimes) || 'video/webm';
      if(formatKey === 'mp4'){
        setStatus("This browser can't encode MP4 directly — exported as WebM instead.");
      }
    }

    const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e)=>{ if(e.data && e.data.size) chunks.push(e.data); };

    const stopped = new Promise(resolve => recorder.onstop = resolve);

    video.currentTime = 0;
    await video.play();
    recorder.start();

    let raf;
    const drawFrame = ()=>{
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      drawCaptionOnCanvas(ctx, video.currentTime, canvas.width, canvas.height);
      setLoaderProgress(state.duration ? (video.currentTime/state.duration)*100 : 0);
      loaderSub.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(state.duration)} · keep this tab open and your device awake`;
      if(!video.paused && !video.ended){
        raf = requestAnimationFrame(drawFrame);
      } else {
        recorder.stop();
      }
    };
    raf = requestAnimationFrame(drawFrame);
    video.onended = ()=> recorder.stop();

    await stopped;
    cancelAnimationFrame(raf);

    const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (state.file.name.replace(/\.[^/.]+$/, '') || 'video') + '-captioned.' + FORMATS[usedFormatKey].ext;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
    if(usedFormatKey === formatKey){
      setStatus(`Downloaded captioned video (${FORMATS[usedFormatKey].ext.toUpperCase()}).`);
    }
  } catch(err){
    console.error(err);
    setStatus(err.message || 'Export failed.', true);
  } finally{
    await releaseWakeLock();
    hideLoader();
    video.currentTime = prevTime;
    if(!wasPaused) video.play(); else video.pause();
    downloadBtn.disabled = false;
    generateBtn.disabled = false;
  }
}

function secondsToSRTTime(s){
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const sec = Math.floor(s%60);
  const ms = Math.round((s - Math.floor(s))*1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
}
function buildSRT(){
  return state.lines.map((line, i)=>
    `${i+1}\n${secondsToSRTTime(line.start)} --> ${secondsToSRTTime(line.end)}\n${line.text}\n`
  ).join('\n');
}
function downloadSRT(){
  if(!state.lines.length) return;
  const blob = new Blob([buildSRT()], { type:'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ((state.file && state.file.name.replace(/\.[^/.]+$/, '')) || 'captions') + '.srt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  setStatus('Downloaded SRT subtitle file.');
}

const downloadDropdown = $('downloadDropdown');
const downloadMenu = $('downloadMenu');
downloadBtn.addEventListener('click', (e)=>{
  e.stopPropagation();
  if(downloadBtn.disabled) return;
  downloadMenu.classList.toggle('show');
});
downloadMenu.querySelectorAll('.dropdown-item').forEach(item=>{
  item.addEventListener('click', (e)=>{
    e.stopPropagation();
    downloadMenu.classList.remove('show');
    const fmt = item.dataset.format;
    if(fmt === 'srt') downloadSRT();
    else exportVideo(fmt);
  });
});
document.addEventListener('click', (e)=>{
  if(!downloadDropdown.contains(e.target)) downloadMenu.classList.remove('show');
});
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') downloadMenu.classList.remove('show');
});

document.addEventListener('keydown', (e)=>{
  if(e.code !== 'Space' && e.key !== ' ') return;
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if(tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if(editBackdrop.classList.contains('show')) return;
  if(!state.file) return;
  e.preventDefault();
  if(video.paused) video.play(); else video.pause();
});