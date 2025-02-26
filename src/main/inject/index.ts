import { join } from "path";

import * as darwin from "./platforms/darwin";
import * as linux from "./platforms/linux";
import * as win32 from "./platforms/win32";
import { existsSync } from "original-fs";
import { DiscordPlatform, PLATFORMS, PlatformData } from "../types";
import { inject, uninject } from "./injector";

const platformModules = {
  darwin,
  linux,
  win32,
};

const platformModule = platformModules[process.platform as keyof typeof platformModules];

const checkInstalled = (appDir: string): boolean => existsSync(join(appDir, ".."));
const checkPlugged = (appDir: string): boolean => existsSync(join(appDir, "..", "app.orig.asar"));

async function getInstallation(platform: DiscordPlatform): Promise<PlatformData> {
  try {
    const path = await platformModule.getAppDir(platform);
    if (!path) return { installed: false, plugged: false, path: null };
    const installed = checkInstalled(path);
    if (!installed) return { installed: false, plugged: false, path: null };
    const plugged = checkPlugged(path);

    return { installed, plugged, path };
  } catch {
    return { installed: false, plugged: false, path: null };
  }
}

export async function listInstallations(): Promise<Record<DiscordPlatform, PlatformData>> {
  return Object.fromEntries(
    await Promise.all(
      PLATFORMS.map(async (platform) => [platform, await getInstallation(platform)]),
    ),
  ) as Record<DiscordPlatform, PlatformData>;
}

export async function plug(platform: DiscordPlatform): Promise<boolean> {
  const { plugged, path } = await getInstallation(platform);
  if (!path) return false;
  if (plugged) {
    await uninject(path);
    const { plugged } = await getInstallation(platform);
    if (plugged) return false;
  }
  await inject(path);
  return true;
}

export async function unplug(platform: DiscordPlatform): Promise<boolean> {
  const { plugged, path } = await getInstallation(platform);
  if (!path) return false;
  if (!plugged) return true;
  await uninject(path);
  return true;
}
