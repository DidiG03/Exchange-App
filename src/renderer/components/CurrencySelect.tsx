import { BASE_CURRENCY, CURRENCY_CODES, CURRENCY_GROUPS } from '../../shared/currencies'
import type { CurrencyCode, SupportedCurrency } from '../../shared/currencies'

interface CurrencySelectProps {
  id: string
  value: CurrencyCode
  onChange: (currency: CurrencyCode) => void
  exclude?: CurrencyCode
  includeAll?: boolean
  className?: string
}

export function CurrencySelect({
  id,
  value,
  onChange,
  exclude,
  includeAll = false,
  className = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700'
}: CurrencySelectProps): React.JSX.Element {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as CurrencyCode)}
      className={className}
    >
      {includeAll && exclude !== BASE_CURRENCY && (
        <option value={BASE_CURRENCY}>{BASE_CURRENCY}</option>
      )}
      {CURRENCY_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.codes
            .filter((code) => code !== exclude)
            .map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
        </optgroup>
      ))}
      {CURRENCY_CODES.filter(
        (code) =>
          code !== exclude &&
          !CURRENCY_GROUPS.some((group) => group.codes.includes(code))
      ).map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
  )
}

export type { SupportedCurrency, CurrencyCode }
