import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ExchangeRate, SupportedCurrency } from '../../database/types'
import { isSessionExpiredResponse } from '../utils/session'

export interface LiveRatesState {
  rates: ExchangeRate[]
  ratesByCurrency: Partial<Record<SupportedCurrency, ExchangeRate>>
  loading: boolean
  refresh: () => Promise<void>
}

export function useLiveRates(): LiveRatesState {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const data = await window.api.getLiveRates()
    if (isSessionExpiredResponse(data) || !Array.isArray(data)) {
      setLoading(false)
      return
    }
    setRates(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    return window.api.onRatesUpdated((updated) => {
      if (isSessionExpiredResponse(updated) || !Array.isArray(updated)) return
      setRates(updated)
      setLoading(false)
    })
  }, [refresh])

  const ratesByCurrency = useMemo(() => {
    const map: Partial<Record<SupportedCurrency, ExchangeRate>> = {}
    for (const rate of rates) {
      map[rate.currency] = rate
    }
    return map
  }, [rates])

  return { rates, ratesByCurrency, loading, refresh }
}
