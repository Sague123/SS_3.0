/**
 * Opens a crop modal for an image file. Returns Promise<Blob> (cropped) or Promise<File> (original if not image or cancel).
 * Uses display-to-canvas coordinate scaling so drag and resize work on mobile and scaled canvases.
 */
function openImageCrop(file) {
  return new Promise(function(resolve, reject) {
    if (!file || !(file.type && file.type.startsWith('image/'))) {
      resolve(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function() {
      URL.revokeObjectURL(url);
      const maxSize = 400;
      let dw = img.width;
      let dh = img.height;
      if (dw > maxSize || dh > maxSize) {
        const s = maxSize / Math.max(dw, dh);
        dw = Math.round(dw * s);
        dh = Math.round(dh * s);
      }
      const minCrop = 80;
      const maxCrop = Math.min(dw, dh);
      let cropSize = Math.min(200, maxCrop);
      if (cropSize < minCrop) cropSize = minCrop;
      let cropX = (dw - cropSize) / 2;
      let cropY = (dh - cropSize) / 2;
      let dragging = false;
      let startX = 0, startY = 0, startCropX = 0, startCropY = 0;

      const overlay = document.createElement('div');
      overlay.className = 'crop-modal-overlay';
      const modal = document.createElement('div');
      modal.className = 'crop-modal';
      const t = (window.I18n && window.I18n.t) ? window.I18n.t.bind(window.I18n) : function(k) { return k; };
      modal.innerHTML =
        '<h3>' + (t('crop_title') || 'Crop image') + '</h3>' +
        '<div class="crop-canvas-wrap">' +
        '<canvas width="' + dw + '" height="' + dh + '"></canvas>' +
        '</div>' +
        '<div class="crop-size-row">' +
        '<label class="crop-size-label">' + (t('crop_size') || 'Size') + '</label>' +
        '<input type="range" class="crop-size-slider" min="' + minCrop + '" max="' + maxCrop + '" value="' + cropSize + '">' +
        '</div>' +
        '<div class="crop-actions">' +
        '<button type="button" class="btn ghost crop-cancel">' + (t('crop_cancel') || 'Cancel') + '</button>' +
        '<button type="button" class="btn primary crop-confirm">' + (t('crop_confirm') || 'Crop') + '</button>' +
        '</div>';
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const canvas = modal.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const slider = modal.querySelector('.crop-size-slider');

      function clampCrop() {
        cropX = Math.max(0, Math.min(dw - cropSize, cropX));
        cropY = Math.max(0, Math.min(dh - cropSize, cropY));
      }

      function draw() {
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, dw, dh);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.rect(0, 0, dw, dh);
        ctx.rect(cropX, cropY, cropSize, cropSize);
        ctx.fill('evenodd');
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(cropX, cropY, cropSize, cropSize);
      }

      function doCrop() {
        var scaleX = img.width / dw;
        var scaleY = img.height / dh;
        var sx = cropX * scaleX;
        var sy = cropY * scaleY;
        var sw = cropSize * scaleX;
        var sh = cropSize * scaleY;
        var out = document.createElement('canvas');
        out.width = Math.round(sw);
        out.height = Math.round(sh);
        var outCtx = out.getContext('2d');
        outCtx.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
        out.toBlob(function(blob) {
          document.body.removeChild(overlay);
          if (blob) resolve(blob);
          else reject(new Error('Crop failed'));
        }, file.type || 'image/jpeg', 0.9);
      }

      function getCanvasCoords(clientX, clientY) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = dw / rect.width;
        var scaleY = dh / rect.height;
        return {
          x: (clientX - rect.left) * scaleX,
          y: (clientY - rect.top) * scaleY
        };
      }

      function pointerDown(clientX, clientY) {
        var p = getCanvasCoords(clientX, clientY);
        if (p.x >= cropX && p.x <= cropX + cropSize && p.y >= cropY && p.y <= cropY + cropSize) {
          dragging = true;
          startX = p.x;
          startY = p.y;
          startCropX = cropX;
          startCropY = cropY;
        }
      }

      function pointerMove(clientX, clientY) {
        if (!dragging) return;
        var p = getCanvasCoords(clientX, clientY);
        cropX = Math.max(0, Math.min(dw - cropSize, startCropX + (p.x - startX)));
        cropY = Math.max(0, Math.min(dh - cropSize, startCropY + (p.y - startY)));
        draw();
      }

      function pointerUp() {
        dragging = false;
      }

      canvas.addEventListener('mousedown', function(e) {
        e.preventDefault();
        pointerDown(e.clientX, e.clientY);
      });
      canvas.addEventListener('mousemove', function(e) {
        pointerMove(e.clientX, e.clientY);
      });
      canvas.addEventListener('mouseup', pointerUp);
      canvas.addEventListener('mouseleave', pointerUp);

      canvas.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        pointerDown(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });
      canvas.addEventListener('touchmove', function(e) {
        if (!dragging || e.touches.length !== 1) return;
        e.preventDefault();
        pointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });
      canvas.addEventListener('touchend', function(e) {
        if (e.touches.length === 0) pointerUp();
      });
      canvas.addEventListener('touchcancel', pointerUp);

      slider.addEventListener('input', function() {
        var prev = cropSize;
        cropSize = Math.max(minCrop, Math.min(maxCrop, Number(slider.value)));
        var dx = (cropSize - prev) / 2;
        cropX -= dx;
        cropY -= dx;
        clampCrop();
        draw();
      });

      modal.querySelector('.crop-cancel').addEventListener('click', function() {
        document.body.removeChild(overlay);
        resolve(file);
      });
      modal.querySelector('.crop-confirm').addEventListener('click', doCrop);

      draw();
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

window.openImageCrop = openImageCrop;
