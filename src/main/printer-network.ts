import { exec } from 'child_process'
import { networkInterfaces, platform } from 'os'
import { promisify } from 'util'
import { Socket } from 'net'
import type { NetworkPrinterDevice } from '../shared/printer-types'
import { isValidIpv4 } from './settings'

const execAsync = promisify(exec)
const IS_WIN = platform() === 'win32'

const DEFAULT_RAW_PORT = 9100
const COMMON_RAW_PORTS = [9100, 9101, 9102] as const
const SCAN_TIMEOUT_MS = IS_WIN ? 1200 : 900
const DIRECT_PROBE_TIMEOUT_MS = IS_WIN ? 6000 : 2000
const SCAN_BATCH_SIZE = 32
const SEND_TIMEOUT_MS = 15000

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

export function getLocalIpv4Addresses(): string[] {
  const addresses: string[] = []

  for (const iface of Object.values(networkInterfaces())) {
    if (!iface) continue
    for (const addr of iface) {
      if (!isIpv4Address(addr.family) || addr.internal) continue
      addresses.push(addr.address)
    }
  }

  return addresses
}

export function getLocalNetworkPrefixes(): string[] {
  const prefixes = new Set<string>()

  for (const address of getLocalIpv4Addresses()) {
    const parts = address.split('.')
    if (parts.length !== 4) continue
    prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`)
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

function connectSocket(socket: Socket, host: string, port: number): void {
  socket.connect({ port, host, family: 4 })
}

function probeHostNode(host: string, port: number, timeoutMs: number): Promise<boolean> {
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
    connectSocket(socket, host, port)
  })
}

async function probeHostWindows(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const timeoutSec = Math.max(3, Math.ceil(timeoutMs / 1000))
  const command =
    `powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue';` +
    `$r = Test-NetConnection -ComputerName '${host}' -Port ${port} -WarningAction SilentlyContinue;` +
    `if ($r.TcpTestSucceeded) { exit 0 } else { exit 1 }"`

  try {
    await execAsync(command, {
      timeout: timeoutSec * 1000 + 2000,
      windowsHide: true
    })
    return true
  } catch {
    return false
  }
}

async function probeHost(host: string, port: number, timeoutMs: number): Promise<boolean> {
  if (IS_WIN) {
    const [nodeOpen, winOpen] = await Promise.all([
      probeHostNode(host, port, timeoutMs),
      probeHostWindows(host, port, timeoutMs)
    ])
    return nodeOpen || winOpen
  }

  return probeHostNode(host, port, timeoutMs)
}

function buildReachabilityHint(host: string): string {
  const printerPrefix = prefixFromHost(host)
  const localAddresses = getLocalIpv4Addresses()
  const localPrefixes = getLocalNetworkPrefixes()

  if (printerPrefix && localPrefixes.length > 0 && !localPrefixes.includes(printerPrefix)) {
    return (
      `This PC is on ${localPrefixes.map((prefix) => `${prefix}.x`).join(', ')}` +
      ` (IP: ${localAddresses.join(', ') || 'unknown'}), but the printer is ${printerPrefix}.x. ` +
      'Connect this Windows PC to the same Wi‑Fi/LAN as the printer. If you use a VM, switch the network adapter to Bridged instead of NAT.'
    )
  }

  if (IS_WIN) {
    return (
      'On Windows, also check that raw TCP port 9100 is enabled on the printer, ' +
      'Windows Firewall allows outbound connections for Exchange Bureau, and the IP is correct in the printer network settings.'
    )
  }

  return 'Check the IP, port, and that raw TCP printing is enabled on the printer.'
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
    const results = await Promise.all(
      batch.map((host) => probeHostPorts(host, COMMON_RAW_PORTS, SCAN_TIMEOUT_MS))
    )
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
    error: `Could not reach ${trimmedHost} on ports ${portsToTry.join(', ')}. ${buildReachabilityHint(trimmedHost)}`
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
    connectSocket(socket, host, port)
  })
}
