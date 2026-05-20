import type { SupportedCurrency } from '../../database/types'
import { useLiveRates } from '../hooks/useLiveRates'
import { formatRate } from '../utils/format'

const CURRENCIES: SupportedCurrency[] = ['EUR', 'GBP', 'USD']

export function LiveRatesPanel(): React.JSX.Element {
  const { ratesByCurrency, loading } = useLiveRates()

  return (
    <div
      className="flex flex-wrap items-center gap-3"
      aria-label="Live exchange rates"
      title="Rates update automatically when saved on the Rates screen"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Live rates
      </span>
      {loading ? (
        <span className="text-xs text-slate-400">Loading…</span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {CURRENCIES.map((code) => {
            const rate = ratesByCurrency[code]
            return (
              <div
                key={code}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
              >
                <span className="font-semibold text-navy-900">{code}</span>
                {rate ? (
                  <>
                    <span className="text-slate-500">
                      Buy <span className="font-medium text-slate-800">{formatRate(rate.buy_rate)}</span>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-500">
                      Sell <span className="font-medium text-slate-800">{formatRate(rate.sell_rate)}</span>
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">Not set</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
