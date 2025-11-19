'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { fetchSession, fetchSessionEvents, fetchSessionScreenshots, Session, SessionEvent, Screenshot } from '@/lib/api';
import ReplayCanvas from '@/components/ReplayCanvas';

export default function SessionReplayPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentScreenshot, setCurrentScreenshot] = useState<Screenshot | null>(null);
  
  // Event overlay state for screenshot replay
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [clickIndicator, setClickIndicator] = useState<{ x: number; y: number; timestamp: number } | null>(null);
  const [screenshotOpacity, setScreenshotOpacity] = useState(1);

  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const screenshotTransitionRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadSessionData();
  }, [sessionId]);

  // Initialize screenshot when screenshots are loaded
  // Always set the first screenshot when screenshots are available, regardless of events or currentIndex
  useEffect(() => {
    if (screenshots.length > 0) {
      // Find first screenshot with valid data_url
      const validScreenshot = screenshots.find(s => s.data_url);
      if (validScreenshot) {
        // Always set screenshot if we don't have one, or if current screenshot doesn't have data_url
        // This ensures screenshot is displayed immediately, even before events are loaded
        if (!currentScreenshot || !currentScreenshot.data_url) {
          console.log('Setting initial screenshot:', {
            screenshotId: validScreenshot.screenshot_id,
            hasDataUrl: !!validScreenshot.data_url,
            dataUrlLength: validScreenshot.data_url?.length || 0,
          });
          setCurrentScreenshot(validScreenshot);
          setScreenshotOpacity(1);
        }
      } else {
        // Log warning if no screenshots have data_url
        console.warn('Screenshots loaded but none have data_url:', screenshots.map(s => ({
          id: s.screenshot_id,
          hasDataUrl: !!s.data_url,
        })));
      }
    }
  }, [screenshots, currentScreenshot]);

  useEffect(() => {
    // Update screenshot based on current event
    // Find the screenshot with the largest timestamp that is still <= event timestamp
    if (screenshots.length > 0) {
      // If events are not loaded yet, ensure we have a screenshot
      if (events.length === 0 || currentIndex >= events.length) {
        // Ensure we have a screenshot even if events are not loaded
        if (!currentScreenshot || !currentScreenshot.data_url) {
          const validScreenshot = screenshots.find(s => s.data_url) || screenshots[0];
          if (validScreenshot) {
            console.log('Setting fallback screenshot (no events):', {
              screenshotId: validScreenshot.screenshot_id,
              hasDataUrl: !!validScreenshot.data_url,
            });
            setCurrentScreenshot(validScreenshot);
            setScreenshotOpacity(1);
          }
        }
        return;
      }

      // Events are loaded, find screenshot matching current event
      const currentEvent = events[currentIndex];
      if (!currentEvent) {
        // If no current event, use first valid screenshot as fallback
        if (!currentScreenshot || !currentScreenshot.data_url) {
          const validScreenshot = screenshots.find(s => s.data_url) || screenshots[0];
          if (validScreenshot) {
            console.log('Setting fallback screenshot (no current event):', {
              screenshotId: validScreenshot.screenshot_id,
              hasDataUrl: !!validScreenshot.data_url,
            });
            setCurrentScreenshot(validScreenshot);
            setScreenshotOpacity(1);
          }
        }
        return;
      }

      const eventTimestamp = new Date(currentEvent.timestamp).getTime();
      
      // Filter screenshots that are <= event timestamp and have valid data_url
      const validScreenshots = screenshots.filter(
        (s) => s.data_url && new Date(s.timestamp).getTime() <= eventTimestamp
      );
      
      let targetScreenshot: Screenshot | null = null;
      
      if (validScreenshots.length > 0) {
        // Find screenshot with the largest timestamp (closest to event timestamp)
        targetScreenshot = validScreenshots.reduce((prev, current) => {
          const prevTime = new Date(prev.timestamp).getTime();
          const currentTime = new Date(current.timestamp).getTime();
          return currentTime > prevTime ? current : prev;
        });
      } else {
        // If no screenshot before event timestamp, use the first valid screenshot as fallback
        targetScreenshot = screenshots.find(s => s.data_url) || screenshots[0];
        console.log('No screenshot before event timestamp, using fallback:', {
          screenshotId: targetScreenshot?.screenshot_id,
          hasDataUrl: !!targetScreenshot?.data_url,
        });
      }
      
      // Update screenshot if it's different and has data_url
      if (targetScreenshot && targetScreenshot.data_url) {
        if (currentScreenshot?.screenshot_id !== targetScreenshot.screenshot_id) {
          // Screenshot changed - use transition
          console.log('Updating screenshot for event (with transition):', {
            eventIndex: currentIndex,
            eventType: currentEvent.event_type,
            screenshotId: targetScreenshot.screenshot_id,
            hasDataUrl: !!targetScreenshot.data_url,
            previousScreenshotId: currentScreenshot?.screenshot_id,
          });
          // Clear any pending transition
          if (screenshotTransitionRef.current) {
            clearTimeout(screenshotTransitionRef.current);
          }
          setScreenshotOpacity(0);
          screenshotTransitionRef.current = setTimeout(() => {
            setCurrentScreenshot(targetScreenshot);
            setScreenshotOpacity(1);
            screenshotTransitionRef.current = null;
          }, 150);
        } else {
          // Same screenshot - ensure opacity is 1
          if (screenshotOpacity !== 1) {
            console.log('Same screenshot, ensuring opacity is 1:', {
              screenshotId: targetScreenshot.screenshot_id,
              currentOpacity: screenshotOpacity,
            });
            setScreenshotOpacity(1);
          }
        }
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (screenshotTransitionRef.current) {
        clearTimeout(screenshotTransitionRef.current);
      }
    };
  }, [currentIndex, events, screenshots, currentScreenshot]);

  // Log when currentScreenshot changes for debugging
  useEffect(() => {
    if (currentScreenshot) {
      console.log('Current screenshot state:', {
        screenshotId: currentScreenshot.screenshot_id,
        hasDataUrl: !!currentScreenshot.data_url,
        dataUrlLength: currentScreenshot.data_url?.length || 0,
        opacity: screenshotOpacity,
      });
      
      // Ensure opacity is 1 if screenshot has data_url and we're not in a transition
      if (currentScreenshot.data_url && screenshotOpacity === 0 && !screenshotTransitionRef.current) {
        console.log('Fixing opacity: screenshot has data_url but opacity is 0, setting to 1');
        setScreenshotOpacity(1);
      }
    }
  }, [currentScreenshot, screenshotOpacity]);

  // Update event overlays when currentIndex changes
  useEffect(() => {
    if (events.length > 0 && currentIndex < events.length) {
      const currentEvent = events[currentIndex];
      
      // Update cursor position for mousemove and click events
      if (currentEvent.viewport_x !== undefined && currentEvent.viewport_y !== undefined) {
        setCursorPosition({ x: currentEvent.viewport_x, y: currentEvent.viewport_y });
        
        // Show click indicator for click events
        if (currentEvent.event_type === 'click') {
          setClickIndicator({ 
            x: currentEvent.viewport_x, 
            y: currentEvent.viewport_y,
            timestamp: Date.now()
          });
          // Clear click indicator after animation
          setTimeout(() => setClickIndicator(null), 600);
        }
      } else {
        setCursorPosition(null);
      }
    }
  }, [currentIndex, events]);

  useEffect(() => {
    if (isPlaying && currentIndex < events.length - 1) {
      const currentEvent = events[currentIndex];
      const nextEvent = events[currentIndex + 1];
      const delay = new Date(nextEvent.timestamp).getTime() - new Date(currentEvent.timestamp).getTime();
      const adjustedDelay = delay / playbackSpeed;

      playbackTimerRef.current = setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
      }, Math.max(10, adjustedDelay));
    } else if (currentIndex >= events.length - 1) {
      setIsPlaying(false);
    }

    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
      }
    };
  }, [isPlaying, currentIndex, events, playbackSpeed]);

  async function loadSessionData() {
    try {
      setLoading(true);
      const [sessionData, eventsData, screenshotsData] = await Promise.all([
        fetchSession(sessionId),
        fetchSessionEvents(sessionId),
        fetchSessionScreenshots(sessionId, true),
      ]);
      setSession(sessionData);
      setEvents(eventsData.data);
      
      // Log screenshots data for debugging
      console.log('Screenshots loaded:', {
        count: screenshotsData.data?.length || 0,
        withDataUrl: screenshotsData.data?.filter(s => s.data_url).length || 0,
        firstScreenshot: screenshotsData.data?.[0] ? {
          id: screenshotsData.data[0].screenshot_id,
          hasDataUrl: !!screenshotsData.data[0].data_url,
          dataUrlLength: screenshotsData.data[0].data_url?.length || 0,
        } : null,
      });
      
      setScreenshots(screenshotsData.data || []);
    } catch (err) {
      console.error('Failed to load session data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load session data');
    } finally {
      setLoading(false);
    }
  }

  function handlePlayPause() {
    setIsPlaying(!isPlaying);
  }

  function handleSpeedChange(speed: number) {
    setPlaybackSpeed(speed);
  }

  function handleSeek(index: number) {
    setCurrentIndex(index);
    setIsPlaying(false);
  }

  function handleReset() {
    setCurrentIndex(0);
    setIsPlaying(false);
  }


  if (loading) {
    return <div className="text-center py-8">Loading session data...</div>;
  }

  if (error || !session) {
    return (
      <div>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error: {error || 'Session not found'}
        </div>
        <Link href="/" className="text-blue-600 hover:text-blue-800">
          ← Back to Sessions
        </Link>
      </div>
    );
  }

  const currentEvent = events[currentIndex];
  const progress = events.length > 0 ? (currentIndex / (events.length - 1)) * 100 : 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link href="/" className="text-blue-600 hover:text-blue-800 mb-2 inline-block">
          ← Back to Sessions
        </Link>
        <h2 className="text-3xl font-bold mb-2">Session Replay</h2>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Session ID:</span>
              <div className="font-mono">{session.session_id.substring(0, 16)}...</div>
            </div>
            <div>
              <span className="text-gray-500">User:</span>
              <div>{session.user_id || 'Anonymous'}</div>
            </div>
            <div>
              <span className="text-gray-500">Started:</span>
              <div>{format(new Date(session.started_at), 'MMM dd, yyyy HH:mm:ss')}</div>
            </div>
            <div>
              <span className="text-gray-500">Device:</span>
              <div>{session.device_type} - {session.browser}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main replay area */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Screenshot replay with event overlays - Canvas-based rendering */}
            <ReplayCanvas
              screenshot={currentScreenshot}
              screenshots={screenshots}
              currentEvent={currentEvent}
              cursorPosition={cursorPosition}
              clickIndicator={clickIndicator}
              opacity={screenshotOpacity}
            />

            {/* Playback controls */}
            <div className="p-4 border-t">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-600">Progress:</span>
                  <input
                    type="range"
                    min="0"
                    max={events.length - 1}
                    value={currentIndex}
                    onChange={(e) => handleSeek(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono">
                    {currentIndex + 1} / {events.length}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  ⏮ Reset
                </button>
                <button
                  onClick={handlePlayPause}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
                <div className="flex gap-2">
                  <span className="text-sm text-gray-600">Speed:</span>
                  {[0.5, 1, 2, 4].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => handleSpeedChange(speed)}
                      className={`px-3 py-1 rounded text-sm ${
                        playbackSpeed === speed
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 hover:bg-gray-300'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Event timeline */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-bold">Event Timeline</h3>
            </div>
            <div className="overflow-y-auto max-h-[600px]">
              {events.map((event, index) => (
                <div
                  key={event.event_id}
                  onClick={() => handleSeek(index)}
                  className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                    index === currentIndex ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-2xl">
                      {event.event_type === 'click' && '🖱️'}
                      {event.event_type === 'input' && '⌨️'}
                      {event.event_type === 'scroll' && '📜'}
                      {event.event_type === 'mousemove' && '🖱'}
                      {event.event_type === 'navigation' && '🔄'}
                      {event.event_type === 'resize' && '📐'}
                      {!['click', 'input', 'scroll', 'mousemove', 'navigation', 'resize'].includes(event.event_type) && '•'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{event.event_type}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {format(new Date(event.timestamp), 'HH:mm:ss.SSS')}
                      </div>
                      {event.target_selector && (
                        <div className="text-xs text-gray-600 truncate mt-1">
                          {event.target_selector}
                        </div>
                      )}
                      {event.input_value && !event.input_masked && (
                        <div className="text-xs bg-gray-100 p-1 rounded mt-1 truncate">
                          {event.input_value}
                        </div>
                      )}
                      {event.input_masked && (
                        <div className="text-xs text-gray-400 mt-1">***MASKED***</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Current event details */}
      {currentEvent && (
        <div className="mt-6 bg-white rounded-lg shadow p-4">
          <h3 className="font-bold mb-3">Current Event Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Type:</span>
              <div className="font-medium">{currentEvent.event_type}</div>
            </div>
            <div>
              <span className="text-gray-500">Timestamp:</span>
              <div>{format(new Date(currentEvent.timestamp), 'HH:mm:ss.SSS')}</div>
            </div>
            <div>
              <span className="text-gray-500">Page URL:</span>
              <div className="truncate">{currentEvent.page_url}</div>
            </div>
            {currentEvent.target_tag && (
              <div>
                <span className="text-gray-500">Target:</span>
                <div className="font-mono">&lt;{currentEvent.target_tag}&gt;</div>
              </div>
            )}
            {currentEvent.viewport_x !== undefined && (
              <div>
                <span className="text-gray-500">Position:</span>
                <div>x:{currentEvent.viewport_x} y:{currentEvent.viewport_y}</div>
              </div>
            )}
            {currentEvent.scroll_x !== undefined && (
              <div>
                <span className="text-gray-500">Scroll:</span>
                <div>x:{currentEvent.scroll_x} y:{currentEvent.scroll_y}</div>
              </div>
            )}
          </div>
          {currentEvent.target_selector && (
            <div className="mt-3">
              <span className="text-gray-500 text-sm">Selector:</span>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded mt-1 overflow-auto">
                {currentEvent.target_selector}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
