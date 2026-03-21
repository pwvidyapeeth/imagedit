class ImageEditor {
  constructor() {
    this.canvas = document.getElementById('mainCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');
    this.propertiesContent = document.getElementById('propertiesContent');
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.zoom = 1;
    this.isBefore = false;
    this.currentTool = 'move';

    this.layers = [];
    this.activeLayerId = null;
    this.history = [];
    this.future = [];

    this.settings = {
      backgroundColor: '#ffffff',
      brightness: 100,
      contrast: 100,
      saturation: 100,
      filter: 'none',
      text: { value: 'New Text', size: 42, color: '#ffffff', font: 'Inter', shadow: 0 },
      brush: { color: '#00d1b2', size: 8 },
      eraserSize: 22,
      crop: { x: 20, y: 20, w: 400, h: 300, ratio: 'free' },
      resize: { w: 1200, h: 800 },
      compression: 0.9,
      output: 'png'
    };

    this.drawing = false;
    this.lastPoint = null;

    this.bindUI();
    this.renderProperties();
    this.addLayer('Background', true);
    this.pushHistory();
    this.render();
  }

  bindUI() {
    document.getElementById('startEditingBtn').onclick = () => this.showEditor();
    document.getElementById('heroStartBtn').onclick = () => this.showEditor();
    document.getElementById('learnMoreBtn').onclick = () => document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('backToLanding').onclick = () => this.showLanding();

    document.getElementById('themeToggle').onclick = () => {
      document.body.classList.toggle('theme-light');
      document.body.classList.toggle('theme-dark');
    };

    this.fileInput.addEventListener('change', (e) => this.handleFile(e.target.files?.[0]));
    this.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); this.dropZone.style.borderColor = 'var(--accent)'; });
    this.dropZone.addEventListener('dragleave', () => this.dropZone.style.borderColor = 'var(--border)');
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.style.borderColor = 'var(--border)';
      this.handleFile(e.dataTransfer.files?.[0]);
    });

    document.querySelectorAll('.tool').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTool = btn.dataset.tool;
        this.renderProperties();
      };
    });

    document.getElementById('undoBtn').onclick = () => this.undo();
    document.getElementById('redoBtn').onclick = () => this.redo();
    document.getElementById('beforeAfterBtn').onclick = () => { this.isBefore = !this.isBefore; this.render(); };
    document.getElementById('zoomInBtn').onclick = () => this.setZoom(this.zoom + 0.1);
    document.getElementById('zoomOutBtn').onclick = () => this.setZoom(this.zoom - 0.1);
    document.getElementById('downloadBtn').onclick = () => this.downloadImage();
    document.getElementById('saveProjectBtn').onclick = () => this.saveProject();

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', () => this.onPointerUp());
  }

  showEditor() {
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('editor').classList.remove('hidden');
  }

  showLanding() {
    document.getElementById('editor').classList.add('hidden');
    document.getElementById('landing').classList.remove('hidden');
  }

  setZoom(z) {
    this.zoom = Math.min(3, Math.max(0.2, z));
    this.canvas.style.transform = `scale(${this.zoom})`;
    document.getElementById('zoomLabel').textContent = `${Math.round(this.zoom * 100)}%`;
  }

  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.zoom,
      y: (e.clientY - rect.top) / this.zoom
    };
  }

  addLayer(name = `Layer ${this.layers.length + 1}`, transparent = false) {
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = this.canvas.width;
    layerCanvas.height = this.canvas.height;
    const lctx = layerCanvas.getContext('2d');
    if (!transparent) {
      lctx.fillStyle = this.settings.backgroundColor;
      lctx.fillRect(0, 0, layerCanvas.width, layerCanvas.height);
    }
    const id = Date.now() + Math.random();
    this.layers.push({ id, name, canvas: layerCanvas, visible: true });
    this.activeLayerId = id;
    this.renderProperties();
  }

  get activeLayer() {
    return this.layers.find(l => l.id === this.activeLayerId) || this.layers[0];
  }

  async handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    await this.withLoading(async () => {
      const img = await this.loadImage(URL.createObjectURL(file));
      this.settings.resize.w = img.width;
      this.settings.resize.h = img.height;
      this.resizeCanvas(img.width, img.height, false);
      const layer = this.activeLayer;
      const lctx = layer.canvas.getContext('2d');
      lctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      lctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
      this.pushHistory();
      this.render();
    });
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  onPointerDown(e) {
    const p = this.getPointerPos(e);
    if (this.currentTool === 'draw' || this.currentTool === 'eraser') {
      this.drawing = true;
      this.lastPoint = p;
      this.drawStroke(p, p);
    }
    if (this.currentTool === 'text') {
      const layer = this.activeLayer;
      const ctx = layer.canvas.getContext('2d');
      const t = this.settings.text;
      ctx.font = `${t.size}px ${t.font}`;
      ctx.fillStyle = t.color;
      if (t.shadow > 0) {
        ctx.shadowColor = '#000a';
        ctx.shadowBlur = t.shadow;
      }
      ctx.fillText(t.value, p.x, p.y);
      ctx.shadowBlur = 0;
      this.pushHistory();
      this.render();
    }
  }

  onPointerMove(e) {
    if (!this.drawing) return;
    const p = this.getPointerPos(e);
    this.drawStroke(this.lastPoint, p);
    this.lastPoint = p;
  }

  onPointerUp() {
    if (this.drawing) this.pushHistory();
    this.drawing = false;
    this.lastPoint = null;
  }

  drawStroke(a, b) {
    const layer = this.activeLayer;
    const lctx = layer.canvas.getContext('2d');
    lctx.lineCap = 'round';
    lctx.lineJoin = 'round';
    if (this.currentTool === 'eraser') {
      lctx.globalCompositeOperation = 'destination-out';
      lctx.strokeStyle = 'rgba(0,0,0,1)';
      lctx.lineWidth = this.settings.eraserSize;
    } else {
      lctx.globalCompositeOperation = 'source-over';
      lctx.strokeStyle = this.settings.brush.color;
      lctx.lineWidth = this.settings.brush.size;
    }
    lctx.beginPath();
    lctx.moveTo(a.x, a.y);
    lctx.lineTo(b.x, b.y);
    lctx.stroke();
    lctx.globalCompositeOperation = 'source-over';
    this.render();
  }

  getFilterString() {
    return `brightness(${this.settings.brightness}%) contrast(${this.settings.contrast}%) saturate(${this.settings.saturation}%)`;
  }

  render(applyEffects = !this.isBefore) {
    this.ctx.save();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.settings.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.filter = applyEffects ? this.getFilterString() : 'none';
    this.layers.forEach(layer => { if (layer.visible) this.ctx.drawImage(layer.canvas, 0, 0); });
    this.ctx.filter = 'none';

    if (applyEffects && this.settings.filter !== 'none') {
      this.applyPostFilter(this.settings.filter);
    }

    if (this.currentTool === 'crop') this.drawCropOverlay();
    this.ctx.restore();
  }

  applyPostFilter(name) {
    let imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const d = imageData.data;
    if (name === 'grayscale' || name === 'sepia' || name === 'vintage') {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (name === 'grayscale') {
          const v = 0.299 * r + 0.587 * g + 0.114 * b;
          d[i] = d[i + 1] = d[i + 2] = v;
        } else {
          d[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
          d[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
          d[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
          if (name === 'vintage') {
            d[i] = Math.min(255, d[i] + 14);
            d[i + 2] = Math.max(0, d[i + 2] - 18);
          }
        }
      }
      this.ctx.putImageData(imageData, 0, 0);
    }
    if (name === 'sharpen') {
      const out = new ImageData(this.canvas.width, this.canvas.height);
      const w = this.canvas.width;
      const h = this.canvas.height;
      const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          for (let c = 0; c < 3; c++) {
            let sum = 0, k = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const idx = ((y + ky) * w + (x + kx)) * 4 + c;
                sum += d[idx] * kernel[k++];
              }
            }
            out.data[(y * w + x) * 4 + c] = Math.max(0, Math.min(255, sum));
          }
          out.data[(y * w + x) * 4 + 3] = d[(y * w + x) * 4 + 3];
        }
      }
      this.ctx.putImageData(out, 0, 0);
    }
    if (name === 'blur') {
      const temp = document.createElement('canvas');
      temp.width = this.canvas.width;
      temp.height = this.canvas.height;
      const tctx = temp.getContext('2d');
      tctx.filter = 'blur(2px)';
      tctx.drawImage(this.canvas, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(temp, 0, 0);
    }
  }

  drawCropOverlay() {
    const c = this.settings.crop;
    this.ctx.strokeStyle = '#6c8cff';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([8, 8]);
    this.ctx.strokeRect(c.x, c.y, c.w, c.h);
    this.ctx.setLineDash([]);
  }

  applyCrop() {
    const c = this.settings.crop;
    const temp = document.createElement('canvas');
    temp.width = c.w;
    temp.height = c.h;
    temp.getContext('2d').drawImage(this.canvas, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);

    this.resizeCanvas(c.w, c.h, false);
    this.layers.forEach(layer => {
      const n = document.createElement('canvas');
      n.width = c.w;
      n.height = c.h;
      n.getContext('2d').drawImage(layer.canvas, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
      layer.canvas = n;
    });
    this.pushHistory();
    this.render();
  }

  resizeCanvas(w, h, copy = true) {
    const oldLayers = copy ? this.layers.map(l => ({ ...l })) : null;
    this.canvas.width = w;
    this.canvas.height = h;
    this.settings.resize = { w, h };
    this.layers.forEach(layer => {
      const nc = document.createElement('canvas');
      nc.width = w;
      nc.height = h;
      if (copy) nc.getContext('2d').drawImage(layer.canvas, 0, 0, w, h);
      layer.canvas = nc;
    });
    if (copy && oldLayers) this.render();
  }

  rotateLayer(angle) {
    const layer = this.activeLayer;
    const src = layer.canvas;
    const dst = document.createElement('canvas');
    dst.width = src.width;
    dst.height = src.height;
    const d = dst.getContext('2d');
    d.translate(dst.width / 2, dst.height / 2);
    d.rotate(angle * Math.PI / 180);
    d.drawImage(src, -src.width / 2, -src.height / 2);
    layer.canvas = dst;
    this.pushHistory();
    this.render();
  }

  flipLayer(axis = 'x') {
    const layer = this.activeLayer;
    const src = layer.canvas;
    const dst = document.createElement('canvas');
    dst.width = src.width;
    dst.height = src.height;
    const d = dst.getContext('2d');
    d.translate(axis === 'x' ? dst.width : 0, axis === 'y' ? dst.height : 0);
    d.scale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1);
    d.drawImage(src, 0, 0);
    layer.canvas = dst;
    this.pushHistory();
    this.render();
  }

  serializeState() {
    return JSON.stringify({
      settings: this.settings,
      activeLayerId: this.activeLayerId,
      layers: this.layers.map(l => ({ id: l.id, name: l.name, visible: l.visible, data: l.canvas.toDataURL('image/png') }))
    });
  }

  async restoreState(state) {
    const parsed = JSON.parse(state);
    this.settings = parsed.settings;
    this.activeLayerId = parsed.activeLayerId;
    this.layers = [];
    for (const l of parsed.layers) {
      const img = await this.loadImage(l.data);
      const c = document.createElement('canvas');
      c.width = this.settings.resize.w;
      c.height = this.settings.resize.h;
      c.getContext('2d').drawImage(img, 0, 0);
      this.layers.push({ id: l.id, name: l.name, visible: l.visible, canvas: c });
    }
    this.canvas.width = this.settings.resize.w;
    this.canvas.height = this.settings.resize.h;
    this.renderProperties();
    this.render();
  }

  pushHistory() {
    this.history.push(this.serializeState());
    if (this.history.length > 30) this.history.shift();
    this.future = [];
  }

  async undo() {
    if (this.history.length < 2) return;
    const current = this.history.pop();
    this.future.push(current);
    await this.restoreState(this.history[this.history.length - 1]);
  }

  async redo() {
    if (!this.future.length) return;
    const next = this.future.pop();
    this.history.push(next);
    await this.restoreState(next);
  }

  async downloadImage() {
    await this.withLoading(async () => {
      this.render();
      const mime = this.settings.output === 'jpg' ? 'image/jpeg' : 'image/png';
      const data = this.canvas.toDataURL(mime, this.settings.compression);
      const a = document.createElement('a');
      a.href = data;
      a.download = `pixelforge.${this.settings.output}`;
      a.click();
    });
  }

  saveProject() {
    localStorage.setItem('pixelforge-project', this.serializeState());
    alert('Project saved locally.');
  }

  renderProperties() {
    const tool = this.currentTool;
    const layerOptions = this.layers.map(l => `<option value="${l.id}" ${l.id === this.activeLayerId ? 'selected' : ''}>${l.name}</option>`).join('');
    this.propertiesContent.innerHTML = `
      <div class="property-group">
        <h5>Layers</h5>
        <button class="btn" id="addLayerBtn">+ New Layer</button>
        <select id="activeLayerSel">${layerOptions}</select>
        <div id="layerList">${this.layers.map(l => `<div class="layer-item"><span>${l.name}</span><button class="btn" data-toggle="${l.id}">${l.visible ? 'Hide' : 'Show'}</button></div>`).join('')}</div>
      </div>
      ${this.renderToolProperties(tool)}
      <div class="property-group">
        <h5>Export</h5>
        <label>Format</label>
        <select id="outputFormat"><option value="png">PNG</option><option value="jpg">JPG</option></select>
        <label>Compression</label>
        <input type="range" id="compression" min="0.2" max="1" step="0.05" value="${this.settings.compression}">
      </div>
    `;

    document.getElementById('addLayerBtn').onclick = () => { this.addLayer(); this.pushHistory(); this.render(); };
    document.getElementById('activeLayerSel').onchange = (e) => this.activeLayerId = Number(e.target.value);
    document.querySelectorAll('[data-toggle]').forEach(btn => btn.onclick = () => {
      const layer = this.layers.find(l => l.id === Number(btn.dataset.toggle));
      layer.visible = !layer.visible;
      this.renderProperties();
      this.render();
    });

    const format = document.getElementById('outputFormat');
    format.value = this.settings.output;
    format.onchange = e => this.settings.output = e.target.value;
    document.getElementById('compression').oninput = e => this.settings.compression = Number(e.target.value);

    this.attachToolBindings(tool);
  }

  renderToolProperties(tool) {
    if (tool === 'crop') return `<div class="property-group"><h5>Crop</h5>
      <label>X</label><input id="cropX" type="number" value="${this.settings.crop.x}">
      <label>Y</label><input id="cropY" type="number" value="${this.settings.crop.y}">
      <label>Width</label><input id="cropW" type="number" value="${this.settings.crop.w}">
      <label>Height</label><input id="cropH" type="number" value="${this.settings.crop.h}">
      <label>Aspect ratio</label><select id="cropRatio"><option value="free">Free</option><option value="1:1">1:1</option><option value="16:9">16:9</option><option value="4:3">4:3</option></select>
      <button class="btn btn-primary" id="applyCropBtn">Apply Crop</button></div>`;
    if (tool === 'resize') return `<div class="property-group"><h5>Resize</h5>
      <label>Width</label><input id="resizeW" type="number" value="${this.canvas.width}">
      <label>Height</label><input id="resizeH" type="number" value="${this.canvas.height}">
      <button class="btn btn-primary" id="applyResizeBtn">Apply Resize</button></div>`;
    if (tool === 'rotate') return `<div class="property-group"><h5>Rotate / Flip</h5>
      <button class="btn" id="rotateLeftBtn">Rotate -90°</button>
      <button class="btn" id="rotateRightBtn">Rotate +90°</button>
      <button class="btn" id="flipXBtn">Flip Horizontal</button>
      <button class="btn" id="flipYBtn">Flip Vertical</button></div>`;
    if (tool === 'adjust') return `<div class="property-group"><h5>Adjustments</h5>
      <label>Brightness</label><input id="brightness" type="range" min="0" max="200" value="${this.settings.brightness}">
      <label>Contrast</label><input id="contrast" type="range" min="0" max="200" value="${this.settings.contrast}">
      <label>Saturation</label><input id="saturation" type="range" min="0" max="200" value="${this.settings.saturation}"></div>`;
    if (tool === 'filter') return `<div class="property-group"><h5>Filter</h5>
      <select id="filterSel"><option value="none">None</option><option value="grayscale">Grayscale</option><option value="sepia">Sepia</option><option value="blur">Blur</option><option value="sharpen">Sharpen</option><option value="vintage">Vintage</option></select></div>`;
    if (tool === 'text') return `<div class="property-group"><h5>Text</h5>
      <label>Content</label><input id="textValue" value="${this.settings.text.value}">
      <label>Size</label><input id="textSize" type="number" min="8" max="160" value="${this.settings.text.size}">
      <label>Color</label><input id="textColor" type="color" value="${this.settings.text.color}">
      <label>Shadow</label><input id="textShadow" type="range" min="0" max="24" value="${this.settings.text.shadow}">
      <p>Click on canvas to place text</p></div>`;
    if (tool === 'draw') return `<div class="property-group"><h5>Brush</h5>
      <label>Color</label><input id="brushColor" type="color" value="${this.settings.brush.color}">
      <label>Size</label><input id="brushSize" type="range" min="1" max="80" value="${this.settings.brush.size}"></div>`;
    if (tool === 'eraser') return `<div class="property-group"><h5>Eraser</h5>
      <label>Size</label><input id="eraserSize" type="range" min="4" max="100" value="${this.settings.eraserSize}"></div>`;
    if (tool === 'bg') return `<div class="property-group"><h5>Background</h5>
      <label>Color</label><input id="bgColor" type="color" value="${this.settings.backgroundColor}"></div>`;
    return `<div class="property-group"><h5>Move</h5><p>Select a layer and use tools to edit.</p></div>`;
  }

  attachToolBindings(tool) {
    if (tool === 'crop') {
      const sync = () => {
        const c = this.settings.crop;
        c.x = Number(document.getElementById('cropX').value);
        c.y = Number(document.getElementById('cropY').value);
        c.w = Number(document.getElementById('cropW').value);
        c.h = Number(document.getElementById('cropH').value);
        const ratio = document.getElementById('cropRatio').value;
        if (ratio !== 'free') {
          const [rw, rh] = ratio.split(':').map(Number);
          c.h = Math.round(c.w * rh / rw);
          document.getElementById('cropH').value = c.h;
        }
        this.render();
      };
      ['cropX', 'cropY', 'cropW', 'cropH', 'cropRatio'].forEach(id => document.getElementById(id).oninput = sync);
      document.getElementById('applyCropBtn').onclick = () => this.applyCrop();
    }
    if (tool === 'resize') {
      document.getElementById('applyResizeBtn').onclick = () => {
        const w = Number(document.getElementById('resizeW').value);
        const h = Number(document.getElementById('resizeH').value);
        this.resizeCanvas(w, h, true);
        this.pushHistory();
        this.render();
      };
    }
    if (tool === 'rotate') {
      document.getElementById('rotateLeftBtn').onclick = () => this.rotateLayer(-90);
      document.getElementById('rotateRightBtn').onclick = () => this.rotateLayer(90);
      document.getElementById('flipXBtn').onclick = () => this.flipLayer('x');
      document.getElementById('flipYBtn').onclick = () => this.flipLayer('y');
    }
    if (tool === 'adjust') {
      ['brightness', 'contrast', 'saturation'].forEach(key => {
        document.getElementById(key).oninput = (e) => { this.settings[key] = Number(e.target.value); this.render(); };
      });
    }
    if (tool === 'filter') {
      const f = document.getElementById('filterSel');
      f.value = this.settings.filter;
      f.onchange = (e) => { this.settings.filter = e.target.value; this.render(); };
    }
    if (tool === 'text') {
      document.getElementById('textValue').oninput = e => this.settings.text.value = e.target.value;
      document.getElementById('textSize').oninput = e => this.settings.text.size = Number(e.target.value);
      document.getElementById('textColor').oninput = e => this.settings.text.color = e.target.value;
      document.getElementById('textShadow').oninput = e => this.settings.text.shadow = Number(e.target.value);
    }
    if (tool === 'draw') {
      document.getElementById('brushColor').oninput = e => this.settings.brush.color = e.target.value;
      document.getElementById('brushSize').oninput = e => this.settings.brush.size = Number(e.target.value);
    }
    if (tool === 'eraser') {
      document.getElementById('eraserSize').oninput = e => this.settings.eraserSize = Number(e.target.value);
    }
    if (tool === 'bg') {
      document.getElementById('bgColor').oninput = e => { this.settings.backgroundColor = e.target.value; this.render(); };
    }
  }

  async withLoading(fn) {
    this.loadingOverlay.classList.remove('hidden');
    await new Promise(r => setTimeout(r, 120));
    try { await fn(); } finally { this.loadingOverlay.classList.add('hidden'); }
  }
}

window.addEventListener('DOMContentLoaded', () => new ImageEditor());
