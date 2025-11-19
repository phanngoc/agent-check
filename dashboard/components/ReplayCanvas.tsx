'use client';

import { useEffect, useRef } from 'react';
import { Screenshot, SessionEvent } from '@/lib/api';

interface ReplayCanvasProps {
  screenshot: Screenshot | null;
  screenshots: Screenshot[];
  currentEvent: SessionEvent | null;
  cursorPosition: { x: number; y: number } | null;
  clickIndicator: { x: number; y: number; timestamp: number } | null;
  opacity?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

interface CachedImage {
  screenshotId: number;
  image: HTMLImageElement;
  loaded: boolean;
}

export default function ReplayCanvas({
  screenshot,
  screenshots,
  currentEvent,
  cursorPosition,
  clickIndicator,
  opacity = 1,
  viewportWidth,
  viewportHeight,
}: ReplayCanvasProps) {
  console.log('[ReplayCanvas] Component render:', {
    hasScreenshot: !!screenshot,
    screenshotId: screenshot?.screenshot_id,
    screenshotsCount: screenshots.length,
    opacity,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCacheRef = useRef<Map<number, CachedImage>>(new Map());
  const animationFrameRef = useRef<number | null>(null);

  // Maximum number of cached images (keep current ±2)
  const MAX_CACHE_SIZE = 5;

  // Load image into cache
  const loadImage = (screenshot: Screenshot): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      console.log('[ReplayCanvas] loadImage called:', {
        screenshotId: screenshot.screenshot_id,
        hasDataUrl: !!screenshot.data_url,
        dataUrlLength: screenshot.data_url?.length || 0,
        dataUrlPrefix: screenshot.data_url?.substring(0, 50) || 'none',
      });

      // Check if already cached
      const cached = imageCacheRef.current.get(screenshot.screenshot_id);
      if (cached && cached.loaded) {
        console.log('[ReplayCanvas] Image already cached:', screenshot.screenshot_id);
        resolve(cached.image);
        return;
      }

      // Create new image
      const img = new Image();
      img.onload = () => {
        console.log('[ReplayCanvas] Image loaded successfully:', {
          screenshotId: screenshot.screenshot_id,
          imageWidth: img.width,
          imageHeight: img.height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
        const cached: CachedImage = {
          screenshotId: screenshot.screenshot_id,
          image: img,
          loaded: true,
        };
        imageCacheRef.current.set(screenshot.screenshot_id, cached);
        resolve(img);
      };
      img.onerror = (error) => {
        console.error('[ReplayCanvas] Image load error:', {
          screenshotId: screenshot.screenshot_id,
          error,
        });
        reject(error);
      };
      
      if (screenshot.data_url) {
        img.src = screenshot.data_url;
        console.log('[ReplayCanvas] Setting image src, dataUrl length:', screenshot.data_url.length);
      } else {
        console.error('[ReplayCanvas] No data_url provided for screenshot:', screenshot.screenshot_id);
        reject(new Error('No data_url provided'));
      }
    });
  };

  // Cleanup old images from cache
  const cleanupCache = (keepIds: Set<number>) => {
    const cache = imageCacheRef.current;
    const toDelete: number[] = [];

    cache.forEach((_, id) => {
      if (!keepIds.has(id)) {
        toDelete.push(id);
      }
    });

    // Delete old entries
    toDelete.forEach((id) => {
      cache.delete(id);
    });

    // If still too many, remove oldest
    if (cache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(cache.entries());
      entries
        .sort((a, b) => a[0] - b[0]) // Sort by ID (older first)
        .slice(0, cache.size - MAX_CACHE_SIZE)
        .forEach(([id]) => cache.delete(id));
    }
  };

  // Preload nearby screenshots
  useEffect(() => {
    console.log('[ReplayCanvas] Preload effect triggered:', {
      hasScreenshot: !!screenshot,
      screenshotId: screenshot?.screenshot_id,
      screenshotsCount: screenshots.length,
    });

    if (!screenshot || screenshots.length === 0) {
      console.log('[ReplayCanvas] Preload skipped: no screenshot or empty screenshots array');
      return;
    }

    const currentIndex = screenshots.findIndex(
      (s) => s.screenshot_id === screenshot.screenshot_id
    );

    console.log('[ReplayCanvas] Current screenshot index:', {
      currentIndex,
      screenshotId: screenshot.screenshot_id,
    });

    if (currentIndex === -1) {
      console.warn('[ReplayCanvas] Screenshot not found in screenshots array');
      return;
    }

    // Preload current ±2 screenshots
    const indicesToLoad = new Set<number>();
    for (let i = Math.max(0, currentIndex - 2); i <= Math.min(screenshots.length - 1, currentIndex + 2); i++) {
      indicesToLoad.add(screenshots[i].screenshot_id);
    }

    console.log('[ReplayCanvas] Preloading screenshots:', {
      indicesToLoad: Array.from(indicesToLoad),
      cacheSize: imageCacheRef.current.size,
    });

    // Load images
    indicesToLoad.forEach((id) => {
      const ss = screenshots.find((s) => s.screenshot_id === id);
      if (ss && ss.data_url) {
        console.log('[ReplayCanvas] Preloading screenshot:', {
          id,
          hasDataUrl: !!ss.data_url,
          dataUrlLength: ss.data_url.length,
        });
        loadImage(ss).catch((err) => {
          console.warn('[ReplayCanvas] Failed to preload screenshot:', id, err);
        });
      } else {
        console.warn('[ReplayCanvas] Screenshot missing data_url:', {
          id,
          hasScreenshot: !!ss,
          hasDataUrl: !!ss?.data_url,
        });
      }
    });

    // Cleanup cache
    cleanupCache(indicesToLoad);
    console.log('[ReplayCanvas] Cache after cleanup:', {
      cacheSize: imageCacheRef.current.size,
      cachedIds: Array.from(imageCacheRef.current.keys()),
    });
  }, [screenshot, screenshots]);

  // Render function
  const render = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      console.log('[ReplayCanvas] Render skipped: canvas or container not available', {
        hasCanvas: !!canvas,
        hasContainer: !!container,
      });
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('[ReplayCanvas] Failed to get 2d context');
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    console.log('[ReplayCanvas] Render called:', {
      containerWidth,
      containerHeight,
      hasScreenshot: !!screenshot,
      screenshotId: screenshot?.screenshot_id,
      hasDataUrl: !!screenshot?.data_url,
      opacity,
      cacheSize: imageCacheRef.current.size,
    });

    // Set canvas size to match container
    canvas.width = containerWidth;
    canvas.height = containerHeight;

    // Clear canvas
    ctx.clearRect(0, 0, containerWidth, containerHeight);

    // Draw background
    ctx.fillStyle = '#f3f4f6'; // bg-gray-100
    ctx.fillRect(0, 0, containerWidth, containerHeight);

    // Draw screenshot if available
    if (screenshot && screenshot.data_url) {
      const cached = imageCacheRef.current.get(screenshot.screenshot_id);
      console.log('[ReplayCanvas] Checking cached image:', {
        screenshotId: screenshot.screenshot_id,
        isCached: !!cached,
        isLoaded: cached?.loaded,
        cacheKeys: Array.from(imageCacheRef.current.keys()),
      });

      if (cached && cached.loaded) {
        const img = cached.image;
        const imgWidth = img.naturalWidth;
        const imgHeight = img.naturalHeight;

        // Check if we have viewport info and should use viewport simulation
        const hasViewportInfo = viewportWidth && viewportHeight && viewportWidth > 0 && viewportHeight > 0;
        const scrollX = currentEvent?.scroll_x ?? 0;
        const scrollY = currentEvent?.scroll_y ?? 0;

        let scale: number;
        let offsetX: number;
        let offsetY: number;
        let scaleFactor: number;

        // Calculate Device Pixel Ratio (DPR)
        const dpr = hasViewportInfo ? imgWidth / viewportWidth : 1;

        if (hasViewportInfo) {
          // Viewport simulation mode: crop and display only viewport area
          
          // Scale CSS pixels to device pixels for source rectangle calculations
          const scaledScrollX = scrollX * dpr;
          const scaledScrollY = scrollY * dpr;
          const scaledViewportWidth = viewportWidth! * dpr;
          const scaledViewportHeight = viewportHeight! * dpr;

          // Calculate source rectangle in screenshot (viewport area)
          const sx = Math.max(0, Math.min(scaledScrollX, imgWidth - scaledViewportWidth));
          const sy = Math.max(0, Math.min(scaledScrollY, imgHeight - scaledViewportHeight));
          const sw = Math.min(scaledViewportWidth, imgWidth - sx);
          const sh = Math.min(scaledViewportHeight, imgHeight - sy);

          // Calculate scaling to fit container (maintain aspect ratio)
          const scaleX = containerWidth / sw;
          const scaleY = containerHeight / sh;
          scale = Math.min(scaleX, scaleY);
          scaleFactor = scale;

          // Calculate destination size
          const scaledWidth = sw * scale;
          const scaledHeight = sh * scale;

          // Center the viewport in container
          offsetX = (containerWidth - scaledWidth) / 2;
          offsetY = (containerHeight - scaledHeight) / 2;

          // Apply opacity
          ctx.globalAlpha = opacity;

          // Draw cropped viewport area from screenshot
          console.log('[ReplayCanvas] Drawing viewport area:', {
            screenshotId: screenshot.screenshot_id,
            imgWidth,
            imgHeight,
            viewportWidth,
            viewportHeight,
            scrollX,
            scrollY,
            sx,
            sy,
            sw,
            sh,
            scaledWidth,
            scaledHeight,
            offsetX,
            offsetY,
            scale,
            opacity,
            dpr,
          });
          ctx.drawImage(
            img,
            sx, sy, sw, sh, // Source rectangle (viewport area in screenshot)
            offsetX, offsetY, scaledWidth, scaledHeight // Destination rectangle (scaled to fit container)
          );
        } else {
          // Fallback: original behavior (scale entire screenshot)
          const scaleX = containerWidth / imgWidth;
          const scaleY = containerHeight / imgHeight;
          scale = Math.min(scaleX, scaleY);
          scaleFactor = scale;

          const scaledWidth = imgWidth * scale;
          const scaledHeight = imgHeight * scale;

          offsetX = (containerWidth - scaledWidth) / 2;
          offsetY = (containerHeight - scaledHeight) / 2;

          // Apply opacity
          ctx.globalAlpha = opacity;

          // Draw full image
          console.log('[ReplayCanvas] Drawing full image (fallback):', {
            screenshotId: screenshot.screenshot_id,
            imgWidth,
            imgHeight,
            scaledWidth,
            scaledHeight,
            offsetX,
            offsetY,
            scale,
            opacity,
          });
          ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
        }

        // Reset alpha
        ctx.globalAlpha = 1;
        console.log('[ReplayCanvas] Image drawn successfully');

        // Draw cursor position
        if (cursorPosition) {
          // Check if cursor is within viewport (when using viewport simulation)
          if (hasViewportInfo) {
            if (
              cursorPosition.x < 0 ||
              cursorPosition.x >= viewportWidth! ||
              cursorPosition.y < 0 ||
              cursorPosition.y >= viewportHeight!
            ) {
              // Cursor is outside viewport, skip drawing
            } else {
              // Calculate cursor position relative to viewport (viewport_x is relative to viewport, not scroll)
              // viewport_x and viewport_y are already relative to viewport (0,0 is top-left of viewport)
              // Convert CSS pixels to Device pixels (x * dpr), then scale to Canvas pixels (* scaleFactor)
              const canvasX = offsetX + cursorPosition.x * dpr * scaleFactor;
              const canvasY = offsetY + cursorPosition.y * dpr * scaleFactor;

              // Outer ping circle
              ctx.strokeStyle = '#3b82f6'; // blue-500
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(canvasX, canvasY, 8, 0, Math.PI * 2);
              ctx.stroke();

              // Inner filled circle
              ctx.fillStyle = 'rgba(59, 130, 246, 0.3)'; // blue-500 with opacity
              ctx.beginPath();
              ctx.arc(canvasX, canvasY, 8, 0, Math.PI * 2);
              ctx.fill();

              // Small center dot
              ctx.fillStyle = '#3b82f6';
              ctx.beginPath();
              ctx.arc(canvasX, canvasY, 2, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            // Fallback: original calculation
            const canvasX = offsetX + cursorPosition.x * scaleFactor;
            const canvasY = offsetY + cursorPosition.y * scaleFactor;

            // Outer ping circle
            ctx.strokeStyle = '#3b82f6'; // blue-500
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(canvasX, canvasY, 8, 0, Math.PI * 2);
            ctx.stroke();

            // Inner filled circle
            ctx.fillStyle = 'rgba(59, 130, 246, 0.3)'; // blue-500 with opacity
            ctx.beginPath();
            ctx.arc(canvasX, canvasY, 8, 0, Math.PI * 2);
            ctx.fill();

            // Small center dot
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.arc(canvasX, canvasY, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Draw click indicator (ripple effect)
        if (clickIndicator) {
          // Check if click is within viewport (when using viewport simulation)
          if (hasViewportInfo) {
            if (
              clickIndicator.x < 0 ||
              clickIndicator.x >= viewportWidth! ||
              clickIndicator.y < 0 ||
              clickIndicator.y >= viewportHeight!
            ) {
              // Click is outside viewport, skip drawing
            } else {
              // Calculate click position relative to viewport (viewport_x is relative to viewport, not scroll)
              // Convert CSS pixels to Device pixels (x * dpr), then scale to Canvas pixels (* scaleFactor)
              const canvasX = offsetX + clickIndicator.x * dpr * scaleFactor;
              const canvasY = offsetY + clickIndicator.y * dpr * scaleFactor;
              const elapsed = Date.now() - clickIndicator.timestamp;
              const duration = 600; // 600ms animation
              const progress = Math.min(elapsed / duration, 1);

              // First ripple
              const radius1 = 16 * progress;
              const alpha1 = 1 - progress;
              ctx.strokeStyle = `rgba(239, 68, 68, ${alpha1})`; // red-500
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(canvasX, canvasY, radius1, 0, Math.PI * 2);
              ctx.stroke();

              // Second ripple (delayed)
              if (elapsed > 120) {
                const progress2 = Math.min((elapsed - 120) / duration, 1);
                const radius2 = 16 * progress2;
                const alpha2 = 1 - progress2;
                ctx.strokeStyle = `rgba(239, 68, 68, ${alpha2})`;
                ctx.beginPath();
                ctx.arc(canvasX, canvasY, radius2, 0, Math.PI * 2);
                ctx.stroke();
              }

              // Center dot
              ctx.fillStyle = '#ef4444'; // red-500
              ctx.beginPath();
              ctx.arc(canvasX, canvasY, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            // Fallback: original calculation
            const canvasX = offsetX + clickIndicator.x * scaleFactor;
            const canvasY = offsetY + clickIndicator.y * scaleFactor;
            const elapsed = Date.now() - clickIndicator.timestamp;
            const duration = 600; // 600ms animation
            const progress = Math.min(elapsed / duration, 1);

            // First ripple
            const radius1 = 16 * progress;
            const alpha1 = 1 - progress;
            ctx.strokeStyle = `rgba(239, 68, 68, ${alpha1})`; // red-500
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(canvasX, canvasY, radius1, 0, Math.PI * 2);
            ctx.stroke();

            // Second ripple (delayed)
            if (elapsed > 120) {
              const progress2 = Math.min((elapsed - 120) / duration, 1);
              const radius2 = 16 * progress2;
              const alpha2 = 1 - progress2;
              ctx.strokeStyle = `rgba(239, 68, 68, ${alpha2})`;
              ctx.beginPath();
              ctx.arc(canvasX, canvasY, radius2, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Center dot
            ctx.fillStyle = '#ef4444'; // red-500
            ctx.beginPath();
            ctx.arc(canvasX, canvasY, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Draw scroll position indicator
        if (currentEvent && currentEvent.scroll_x !== undefined && currentEvent.scroll_y !== undefined) {
          const text = `Scroll: ${currentEvent.scroll_x}, ${currentEvent.scroll_y}`;
          const padding = 8;
          const fontSize = 12;
          
          ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
          const metrics = ctx.measureText(text);
          const textWidth = metrics.width;
          const textHeight = fontSize;

          // Background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          const bgX = containerWidth - textWidth - padding * 2 - 8; // 8px from right edge
          const bgY = 8; // 8px from top
          ctx.fillRect(bgX, bgY, textWidth + padding * 2, textHeight + padding * 2);

          // Text
          ctx.fillStyle = '#ffffff';
          ctx.fillText(text, bgX + padding, bgY + padding + textHeight - 2);
        }
      } else {
        // Image not loaded yet, show loading state
        console.log('[ReplayCanvas] Image not loaded yet, showing loading state');
        ctx.fillStyle = '#9ca3af'; // gray-400
        ctx.font = '14px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Loading screenshot...', containerWidth / 2, containerHeight / 2);
      }
    } else {
      // No screenshot available
      console.log('[ReplayCanvas] No screenshot available:', {
        hasScreenshot: !!screenshot,
        hasDataUrl: !!screenshot?.data_url,
      });
      ctx.fillStyle = '#9ca3af'; // gray-400
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No screenshot available', containerWidth / 2, containerHeight / 2);
    }
  };

  // Render on changes - use requestAnimationFrame for smooth updates
  useEffect(() => {
    // Cancel any existing animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Render immediately
    render();

    // For click animations, continue rendering until animation completes
    if (clickIndicator) {
      const clickTimestamp = clickIndicator.timestamp; // Capture timestamp to avoid stale closure
      const animate = () => {
        render();
        const elapsed = Date.now() - clickTimestamp;
        if (elapsed < 600) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          animationFrameRef.current = null;
        }
      };
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [screenshot, cursorPosition, clickIndicator, currentEvent, opacity]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      render();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load current screenshot image
  useEffect(() => {
    console.log('[ReplayCanvas] Load current screenshot effect:', {
      hasScreenshot: !!screenshot,
      screenshotId: screenshot?.screenshot_id,
      hasDataUrl: !!screenshot?.data_url,
      dataUrlLength: screenshot?.data_url?.length || 0,
    });

    if (screenshot && screenshot.data_url) {
      console.log('[ReplayCanvas] Loading current screenshot:', screenshot.screenshot_id);
      loadImage(screenshot)
        .then((img) => {
          console.log('[ReplayCanvas] Current screenshot loaded, triggering render');
          // Trigger render after image loads
          render();
        })
        .catch((err) => {
          console.error('[ReplayCanvas] Failed to load current screenshot:', err);
        });
    } else {
      console.log('[ReplayCanvas] No screenshot to load');
    }
  }, [screenshot]);

  return (
    <div
      ref={containerRef}
      className="bg-gray-100 aspect-video relative overflow-hidden min-h-[500px] w-full h-full"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
      />
    </div>
  );
}

