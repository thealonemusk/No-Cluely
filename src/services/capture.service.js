const { desktopCapturer, screen } = require('electron');
const logger = require('../core/logger').createServiceLogger('CAPTURE');
const config = require('../core/config');

class CaptureService {
  constructor() {
    this.isProcessing = false;
  }

  listDisplays() {
    try {
      const displays = screen.getAllDisplays().map(d => ({
        id: d.id,
        bounds: d.bounds,
        size: d.size,
        scaleFactor: d.scaleFactor,
        rotation: d.rotation,
        touchSupport: d.touchSupport || 'unknown'
      }));
      return { success: true, displays };
    } catch (error) {
      logger.error('Failed to list displays', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Capture screenshot and return an image buffer.
   * options: { displayId?: number, area?: { x, y, width, height } }
   */
  async captureAndProcess(options = {}) {
    if (this.isProcessing) throw new Error('Capture already in progress');
    this.isProcessing = true;
    const startTime = Date.now();
    try {
      const wantsCrop = options.area && this._isValidArea(options.area);
      // A crop rectangle is expressed in full-resolution display coordinates,
      // so the capture itself must stay full-size; everything else is grabbed
      // pre-scaled, which is both faster to composite and far smaller to send.
      const { image, metadata } = await this.captureScreenshot({
        ...options,
        fullResolution: wantsCrop
      });

      let finalImage = image;
      if (wantsCrop) {
        try {
          finalImage = image.crop(options.area);
        } catch (e) {
          logger.warn('Crop failed, returning full image', { error: e.message, area: options.area });
        }
      }

      finalImage = this._downscaleToBudget(finalImage);
      const { buffer, mimeType } = this._encode(finalImage);

      logger.logPerformance('Screenshot capture', startTime, {
        bytes: buffer.length,
        mimeType,
        dimensions: finalImage.getSize()
      });

      return {
        imageBuffer: buffer,
        mimeType,
        metadata: {
          timestamp: new Date().toISOString(),
          source: metadata,
          processingTime: Date.now() - startTime
        }
      };
    } finally {
      this.isProcessing = false;
    }
  }

  async captureScreenshot(options = {}) {
    const targetDisplay = this._getTargetDisplay(options.displayId);
    const { width, height } = targetDisplay.size || { width: 1920, height: 1080 };
    const requested = options.fullResolution
      ? { width, height }
      : this._fitToBudget(width, height);

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: requested
    });

    if (sources.length === 0) {
      throw new Error('No screen sources available for capture');
    }

    // `display_id` is the authoritative link back to the Electron display.
    // Thumbnail sizes can no longer be used as the heuristic because we now
    // ask for a scaled-down thumbnail, so they never equal the display size.
    const wantedId = String(targetDisplay.id);
    const source = sources.find(s => String(s.display_id) === wantedId) || sources[0];

    const image = source.thumbnail;
    if (!image || image.isEmpty()) throw new Error('Failed to capture screen thumbnail');

    logger.debug('Screenshot captured successfully', {
      sourceName: source.name,
      requested,
      imageSize: image.getSize()
    });

    return {
      image,
      metadata: {
        displayId: targetDisplay.id,
        sourceName: source.name,
        dimensions: image.getSize(),
        captureTime: new Date().toISOString()
      }
    };
  }

  /**
   * Longest-edge budget for anything we upload to an LLM. Screens are captured
   * and re-encoded at this size: a 4K frame drops from tens of megabytes of PNG
   * to a few hundred kilobytes of JPEG, which is the difference between seconds
   * and milliseconds of upload before the model can even start reading.
   */
  _maxEdge() {
    const configured = Number(config.get('capture.maxEdge'));
    return Number.isFinite(configured) && configured > 0 ? Math.round(configured) : 1600;
  }

  _fitToBudget(width, height) {
    const maxEdge = this._maxEdge();
    const longest = Math.max(width, height);
    if (!Number.isFinite(longest) || longest <= 0 || longest <= maxEdge) {
      return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
    }
    const scale = maxEdge / longest;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  _downscaleToBudget(image) {
    try {
      const size = image.getSize();
      const target = this._fitToBudget(size.width, size.height);
      if (target.width === size.width && target.height === size.height) {
        return image;
      }
      return image.resize({ ...target, quality: 'good' });
    } catch (e) {
      logger.warn('Downscale failed, using original image', { error: e.message });
      return image;
    }
  }

  _encode(image) {
    const quality = Number(config.get('capture.jpegQuality'));
    const normalized = Number.isFinite(quality) ? Math.min(100, Math.max(1, Math.round(quality))) : 80;
    if (config.get('capture.format') === 'png') {
      return { buffer: image.toPNG(), mimeType: 'image/png' };
    }
    try {
      const buffer = image.toJPEG(normalized);
      if (buffer && buffer.length) {
        return { buffer, mimeType: 'image/jpeg' };
      }
    } catch (e) {
      logger.warn('JPEG encode failed, falling back to PNG', { error: e.message });
    }
    return { buffer: image.toPNG(), mimeType: 'image/png' };
  }

  _getTargetDisplay(displayId) {
    const all = screen.getAllDisplays();
    if (!all || all.length === 0) return screen.getPrimaryDisplay();
    if (displayId == null) return screen.getPrimaryDisplay();
    const found = all.find(d => d.id === displayId);
    return found || screen.getPrimaryDisplay();
  }

  _isValidArea(area) {
    return area && Number.isFinite(area.x) && Number.isFinite(area.y) &&
      Number.isFinite(area.width) && Number.isFinite(area.height) &&
      area.width > 0 && area.height > 0;
  }
}

module.exports = new CaptureService();
