/**
 * Minimal loader + ambient types for the official YouTube IFrame Player API
 * (https://developers.google.com/youtube/iframe_api_reference), scoped to exactly what
 * `OceanView.tsx` uses. No `@types/youtube` dependency is added; this repo has no other YouTube
 * integration to share it with, and the full type package covers a much larger surface than one
 * player.
 */

export const YT_PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

/** 101/150 both mean the video owner has disabled playback in embedded players. */
export const YT_EMBED_RESTRICTED_ERROR_CODES = new Set([101, 150]);

export interface YTPlayerEvent<T = void> {
  target: YTPlayer;
  data: T;
}

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getDuration(): number;
  getPlayerState(): number;
  mute(): void;
  destroy(): void;
}

export interface YTPlayerOptions {
  videoId: string;
  /** The iframe's `width`/`height` attributes — HTML honors percentage strings for `<iframe>`, which
   * is what actually makes the player fill its absolutely-positioned container responsively; the API
   * otherwise defaults to a fixed 640×390 iframe. */
  width?: string;
  height?: string;
  playerVars: Record<string, number | string>;
  events: {
    onReady?: (event: YTPlayerEvent) => void;
    onStateChange?: (event: YTPlayerEvent<number>) => void;
    onError?: (event: YTPlayerEvent<number>) => void;
  };
}

interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads `https://www.youtube.com/iframe_api` at most once per page, however many players open it. */
export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        if (window.YT) resolve(window.YT);
        else reject(new Error('YouTube IFrame API did not attach window.YT'));
      };
      const existing = document.querySelector<HTMLScriptElement>('script[data-youtube-iframe-api]');
      if (existing) return;
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.youtubeIframeApi = 'true';
      script.onerror = () => reject(new Error('Failed to load the YouTube IFrame API script'));
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}
