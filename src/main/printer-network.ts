import { networkInterfaces } from 'os'
import { Socket } from 'net'
import type { NetworkPrinterDevice } from '../shared/printer-types'
import { isValidIpv4 } from './settings'

const DEFAULT_RAW_PORT = 9100
const COMMON_RAW_PORTS = [9100, 9101, 9102] as const
const SCAN_TIMEOUT_MS = 900
const DIRECT_PROBE_TIMEOUT_MS = 2000
const SCAN_BATCH_SIZE = 32
const SEND_TIMEOUT_MS = 12000

export interface NetworkPrinterScanOptions {
  knownHost?: string
}

export interface NetworkPrinterTestResult {
  success: boolean
  error?: string
  port?: number
}

function isIpv4Address(family: string | number): boolean {
  return family === 'IPv4' || family === 4
}

export function getLocalNetworkPrefixes(): string[] {
  const prefixes = new Set<string>()

  for (const iface of Object.values(networkInterfaces())) {
    if (!iface) continue
    for (const addr of iface) {
      if (!isIpv4Address(addr.family) || addr.internal) continue
      const parts = addr.address.split('.')
      if (parts.length !== 4) continue
      prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`)
    }
  }

  return [...prefixes]
}

function prefixFromHost(host: string): string | null {
  if (!isValidIpv4(host)) return null
  const parts = host.split('.')
  return `${parts[0]}.${parts[1]}.${parts[2]}`
}

function getPrefixesForScan(knownHost?: string): string[] {
  const prefixes = new Set(getLocalNetworkPrefixes())
  if (knownHost) {
    const knownPrefix = prefixFromHost(knownHost.trim())
    if (knownPrefix) prefixes.add(knownPrefix)
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

async function probeHostPorts(
  host: string,
  ports: readonly number[],
  timeoutMs: number
): Promise<NetworkPrinterDevice[]> {
  const results = await Promise.all(
    ports.map(async (port) => {
      const open = await probeHost(host, port, timeoutMs)
      if (!open) return null
      return {
        host,
        port,
        label: `${host}:${port}`
      } satisfies NetworkPrinterDevice
    })
  )

  return results.filter((device): device is NetworkPrinterDevice => device !== null)
}

async function scanPrefix(prefix: string): Promise<NetworkPrinterDevice[]> {
  const hosts = Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`)
  const found: NetworkPrinterDevice[] = []

  for (let index = 0; index < hosts.length; index += SCAN_BATCH_SIZE) {
    const batch = hosts.slice(index, index + SCAN_BATCH_SIZE)
    const results = await Promise.all(batch.map((host) => probeHostPorts(host, COMMON_RAW_PORTS, SCAN_TIMEOUT_MS)))
    for (const devices of results) {
      found.push(...devices)
    }
  }

  return found
}

export async function scanNetworkPrinters(
  options: NetworkPrinterScanOptions = {}
): Promise<NetworkPrinterDevice[]> {
  const knownHost = options.knownHost?.trim() ?? ''
  const byKey = new Map<string, NetworkPrinterDevice>()

  if (knownHost && isValidIpv4(knownHost)) {
    const directMatches = await probeHostPorts(knownHost, COMMON_RAW_PORTS, DIRECT_PROBE_TIMEOUT_MS)
    for (const device of directMatches) {
      byKey.set(`${device.host}:${device.port}`, device)
    }
  }

  const prefixes = getPrefixesForScan(knownHost)
  for (const prefix of prefixes) {
    const devices = await scanPrefix(prefix)
    for (const device of devices) {
      byKey.set(`${device.host}:${device.port}`, device)
    }
  }

  return [...byKey.values()].sort((a, b) => compareIpv4(a.host, b.host) || a.port - b.port)
}

export async function testNetworkPrinterConnection(
  host: string,
  port = DEFAULT_RAW_PORT
): Promise<NetworkPrinterTestResult> {
  const trimmedHost = host.trim()
  if (!isValidIpv4(trimmedHost)) {
    return { success: false, error: 'Enter a valid printer IP address (e.g. 192.168.1.50).' }
  }

  const portsToTry = [...new Set([port, ...COMMON_RAW_PORTS])]
  for (const candidatePort of portsToTry) {
    const open = await probeHost(trimmedHost, candidatePort, DIRECT_PROBE_TIMEOUT_MS)
    if (open) {
      return { success: true, port: candidatePort }
    }
  }

  return {
    success: false,
    error: `Could not reach ${trimmedHost} on ports ${portsToTry.join(', ')}. Check the IP, port, and that raw TCP printing is enabled on the printer.`
  }
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
