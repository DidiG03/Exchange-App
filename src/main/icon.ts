import { app, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

export function getAppIcon(): NativeImage | undefined {
  const candidates: string[] = app.isPackaged
    ? [
        join(process.resourcesPath, 'icon.ico'),
        join(process.resourcesPath, 'icon.png')
      ]
    : [join(__dirname, '../../resources/icon.png')]

  for (const iconPath of candidates) {
    if (!existsSync(iconPath)) continue
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) {
      return image
    }
  }

  return undefined
}
