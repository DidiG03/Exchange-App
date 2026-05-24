import { networkInterfaces } from 'os'
import { Socket } from 'net'
import type { NetworkPrinterDevice } from '../shared/printer-types'

const DEFAULT_RAW_PORT = 9100
const SCAN_TIMEOUT_MS = 450
const SCAN_BATCH_SIZE = 48
const SEND_TIMEOUT_MS = 12000

export function getLocalNetworkPrefixes(): string[] {
  const prefixes = new Set<string>()

  for (const iface of Object.values(networkInterfaces())) {
    if (!iface) continue
    for (const addr of iface) {
      if (addr.family !== 'IPv4' || addr.internal) continue
      const parts = addr.address.split('.')
      if (parts.length !== 4) continue
      prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`)
    }
  }

  return [...prefixes]
}

function compareIpv4(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 4; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

function probeHost(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket()
    let settled = false

    const finish = (open: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(open)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

async function scanPrefix(prefix: string, port: number): Promise<NetworkPrinterDevice[]> {
  const hosts = Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`)
  const found: NetworkPrinterDevice[] = []

  for (let index = 0; index < hosts.length; index += SCAN_BATCH_SIZE) {
    const batch = hosts.slice(index, index + SCAN_BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (host) => {
        const open = await probeHost(host, port, SCAN_TIMEOUT_MS)
        if (!open) return null
        return {
          host,
          port,
          label: `${host}:${port}`
        } satisfies NetworkPrinterDevice
      })
    )
    found.push(...results.filter((device): device is NetworkPrinterDevice => device !== null))
  }

  return found
}

export async function scanNetworkPrinters(
  port = DEFAULT_RAW_PORT
): Promise<NetworkPrinterDevice[]> {
  const prefixes = getLocalNetworkPrefixes()
  if (prefixes.length === 0) return []

  const byKey = new Map<string, NetworkPrinterDevice>()

  for (const prefix of prefixes) {
    const devices = await scanPrefix(prefix, port)
    for (const device of devices) {
      byKey.set(`${device.host}:${device.port}`, device)
    }
  }

  return [...byKey.values()].sort((a, b) => compareIpv4(a.host, b.host))
}

export function sendRawToNetworkPrinter(
  host: string,
  port: number,
  buffer: Buffer
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let settled = false

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      socket.destroy()
      if (error) reject(error)
      else resolve()
    }

    socket.setTimeout(SEND_TIMEOUT_MS)
    socket.once('connect', () => {
      socket.write(buffer, (writeError) => {
        if (writeError) {
          finish(writeError)
          return
        }
        socket.end(() => finish())
      })
    })
    socket.once('timeout', () => finish(new Error('Network printer connection timed out')))
    socket.once('error', (error) => finish(error))
    socket.connect(port, host)
  })
}
