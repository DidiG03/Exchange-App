import { useLiveRates } from '../hooks/useLiveRates'
import { formatRate } from '../utils/format'

export function LiveRatesPanel(): React.JSX.Element {
  const { rates, loading } = useLiveRates()

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-3"
      aria-label="Live exchange rates"
      title="Rates update automatically when saved on the Rates screen"
    >
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
        Live rates
      </span>
      {loading ? (
        <span className="text-xs text-slate-400">Loading…</span>
      ) : rates.length === 0 ? (
        <span className="text-xs text-slate-400">No rates configured</span>
      ) : (
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">
          {rates.map((rate) => (
            <div
              key={rate.currency}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
            >
              <span className="font-semibold text-navy-900">{rate.currency}</span>
              <span className="text-slate-500">
                Buy <span className="font-medium text-slate-800">{formatRate(rate.buy_rate)}</span>
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">
                Sell <span className="font-medium text-slate-800">{formatRate(rate.sell_rate)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
