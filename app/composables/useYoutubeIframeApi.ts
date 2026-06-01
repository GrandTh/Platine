/**
 * Charge l'API IFrame YouTube une seule fois et résout quand elle est prête.
 * (https://developers.google.com/youtube/iframe_api_reference)
 */

interface YT {
  Player: new (el: HTMLElement | string, opts: unknown) => YTPlayer
  PlayerState: { ENDED: number, PLAYING: number, PAUSED: number, BUFFERING: number, CUED: number }
}

export interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  loadVideoById(id: string): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  seekTo(seconds: number, allowSeekAhead?: boolean): void
  mute(): void
  unMute(): void
  destroy(): void
}

declare global {
  interface Window {
    YT?: YT
    onYouTubeIframeAPIReady?: () => void
  }
}

let loader: Promise<YT> | null = null

export function useYoutubeIframeApi(): Promise<YT> {
  if (!import.meta.client) return Promise.reject(new Error('client only'))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (loader) return loader

  loader = new Promise<YT>((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!)
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return loader
}
