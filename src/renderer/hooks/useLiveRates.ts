import { useCallback, useEffect, useState } from 'react'
import type { ExchangeRate, SupportedCurrency } from '../../database/types'
import { isSessionExpiredResponse } from '../utils/session'

const CURRENCIES: SupportedCurrency[] = ['EUR', 'GBP', 'USD']

export interface LiveRatesState {
  rates: ExchangeRate[]
  ratesByCurrency: Record<SupportedCurrency, ExchangeRate | null>
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

  const ratesByCurrency = CURRENCIES.reduce(
    (acc, code) => {
      acc[code] = rates.find((r) => r.currency === code) ?? null
      return acc
    },
    {} as Record<SupportedCurrency, ExchangeRate | null>
  )

  return { rates, ratesByCurrency, loading, refresh }
}
