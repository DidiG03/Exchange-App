import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ExchangePairRate, ExchangeRate, LiveRatesSnapshot, SupportedCurrency } from '../../database/types'
import { pairKey } from '../utils/exchange'
import { isSessionExpiredResponse } from '../utils/session'

export interface LiveRatesState {
  rates: ExchangeRate[]
  pairs: ExchangePairRate[]
  ratesByCurrency: Partial<Record<SupportedCurrency, ExchangeRate>>
  pairRatesByKey: Partial<Record<string, ExchangePairRate>>
  loading: boolean
  refresh: () => Promise<void>
}

function normalizeSnapshot(data: LiveRatesSnapshot | unknown): LiveRatesSnapshot {
  if (
    data &&
    typeof data === 'object' &&
    'all' in data &&
    Array.isArray((data as LiveRatesSnapshot).all)
  ) {
    const snapshot = data as LiveRatesSnapshot
    return {
      all: snapshot.all,
      pairs: Array.isArray(snapshot.pairs) ? snapshot.pairs : []
    }
  }

  if (Array.isArray(data)) {
    return { all: data as ExchangeRate[], pairs: [] }
  }

  return { all: [], pairs: [] }
}

export function useLiveRates(): LiveRatesState {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [pairs, setPairs] = useState<ExchangePairRate[]>([])
  const [loading, setLoading] = useState(true)

  const applySnapshot = useCallback((snapshot: LiveRatesSnapshot) => {
    setRates(snapshot.all)
    setPairs(snapshot.pairs)
    setLoading(false)
  }, [])

  const refresh = useCallback(async () => {
    const data = await window.api.getLiveRates()
    if (isSessionExpiredResponse(data)) {
      setLoading(false)
      return
    }
    applySnapshot(normalizeSnapshot(data))
  }, [applySnapshot])

  useEffect(() => {
    void refresh()
    return window.api.onRatesUpdated((updated) => {
      if (isSessionExpiredResponse(updated)) return
      applySnapshot(normalizeSnapshot(updated))
    })
  }, [applySnapshot, refresh])

  const ratesByCurrency = useMemo(() => {
    const map: Partial<Record<SupportedCurrency, ExchangeRate>> = {}
    for (const rate of rates) {
      map[rate.currency] = rate
    }
    return map
  }, [rates])

  const pairRatesByKey = useMemo(() => {
    const map: Partial<Record<string, ExchangePairRate>> = {}
    for (const pair of pairs) {
      map[pairKey(pair.from_currency, pair.to_currency)] = pair
    }
    return map
  }, [pairs])

  return { rates, pairs, ratesByCurrency, pairRatesByKey, loading, refresh }
}
