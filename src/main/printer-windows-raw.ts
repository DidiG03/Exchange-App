import { execFile } from 'child_process'
import { unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const RAW_PRINT_HELPER = `
using System;
using System.IO;
using System.Runtime.InteropServices;

public class ExchangeBureauRawPrinter
{
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOW
  {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr hPrinter, IntPtr pDefault);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, DOCINFOW di);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static bool SendFileToPrinter(string printerName, string filePath)
  {
    byte[] bytes = File.ReadAllBytes(filePath);
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
    {
      return false;
    }

    try
    {
      var docInfo = new DOCINFOW
      {
        pDocName = "Exchange Bureau Receipt",
        pDataType = "RAW"
      };

      if (!StartDocPrinter(hPrinter, 1, docInfo))
      {
        return false;
      }

      try
      {
        if (!StartPagePrinter(hPrinter))
        {
          return false;
        }

        try
        {
          IntPtr unmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
          try
          {
            Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);
            int bytesWritten;
            if (!WritePrinter(hPrinter, unmanagedBytes, bytes.Length, out bytesWritten))
            {
              return false;
            }
          }
          finally
          {
            Marshal.FreeCoTaskMem(unmanagedBytes);
          }
        }
        finally
        {
          EndPagePrinter(hPrinter);
        }
      }
      finally
      {
        EndDocPrinter(hPrinter);
      }
    }
    finally
    {
      ClosePrinter(hPrinter);
    }

    return true;
  }
}
`

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

export async function sendRawToWindowsPrinter(printerName: string, buffer: Buffer): Promise<void> {
  const trimmedName = printerName.trim()
  if (!trimmedName) {
    throw new Error('Printer name is required.')
  }

  const tmpFile = join(tmpdir(), `exchange-bureau-raw-${Date.now()}.bin`)
  const helperPath = join(tmpdir(), `exchange-bureau-raw-helper-${Date.now()}.cs`)
  writeFileSync(tmpFile, buffer)
  writeFileSync(helperPath, RAW_PRINT_HELPER, 'utf8')

  const script =
    `Add-Type -Path '${escapePowerShellSingleQuoted(helperPath)}'` +
    `\n$result = [ExchangeBureauRawPrinter]::SendFileToPrinter('${escapePowerShellSingleQuoted(trimmedName)}', '${escapePowerShellSingleQuoted(tmpFile)}')` +
    `\nif (-not $result) { throw 'Windows RAW print failed. In Settings, choose Local printer and pick the exact name from Windows (e.g. XP-80C).' }`

  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 }
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Windows RAW print failed.'
    throw new Error(detail)
  } finally {
    for (const file of [tmpFile, helperPath]) {
      try {
        unlinkSync(file)
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

export async function printWindowsTestReceipt(printerName: string): Promise<void> {
  const init = Buffer.from([0x1b, 0x40])
  const line = Buffer.from('Exchange Bureau test print\r\n', 'ascii')
  const cut = Buffer.from([0x1d, 0x56, 0x00])
  await sendRawToWindowsPrinter(printerName, Buffer.concat([init, line, line, cut]))
}
