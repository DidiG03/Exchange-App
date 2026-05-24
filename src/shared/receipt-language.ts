export type ReceiptLanguage = 'sq' | 'en'

export const RECEIPT_LANGUAGES: { value: ReceiptLanguage; label: string }[] = [
  { value: 'sq', label: 'Albanian' },
  { value: 'en', label: 'English' }
]

export function isReceiptLanguage(value: unknown): value is ReceiptLanguage {
  return value === 'sq' || value === 'en'
}
