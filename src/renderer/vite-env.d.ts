/// <reference types="vite/client" />

import type { ExchangeApi } from '../main/preload'

declare global {
  interface Window {
    api: ExchangeApi
  }
}

export {}
