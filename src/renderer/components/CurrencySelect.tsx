import { CURRENCY_CODES, CURRENCY_GROUPS } from '../../shared/currencies'
import type { SupportedCurrency } from '../../database/types'

interface CurrencySelectProps {
  id: string
  value: SupportedCurrency
  onChange: (currency: SupportedCurrency) => void
  exclude?: SupportedCurrency
  suffix?: string
  className?: string
}

export function CurrencySelect({
  id,
  value,
  onChange,
  exclude,
  suffix = '',
  className = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700'
}: CurrencySelectProps): React.JSX.Element {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as SupportedCurrency)}
      className={className}
    >
      {CURRENCY_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.codes
            .filter((code) => code !== exclude)
            .map((code) => (
              <option key={code} value={code}>
                {code}
                {suffix}
              </option>
            ))}
        </optgroup>
      ))}
      {/* Any code not listed in a group (safety) */}
      {CURRENCY_CODES.filter(
        (code) =>
          code !== exclude &&
          !CURRENCY_GROUPS.some((g) => g.codes.includes(code))
      ).map((code) => (
        <option key={code} value={code}>
          {code}
          {suffix}
        </option>
      ))}
    </select>
  )
}
