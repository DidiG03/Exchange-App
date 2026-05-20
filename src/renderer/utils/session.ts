import { SESSION_EXPIRED_CODE } from '../../shared/auth-constants'

export function isSessionExpiredResponse(
  value: unknown
): value is { code: typeof SESSION_EXPIRED_CODE; message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    value.code === SESSION_EXPIRED_CODE
  )
}
