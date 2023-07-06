import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  chownSync,
  statSync,
} from "original-fs";
import { join, sep } from "path";
import fetch from "node-fetch";
import { IpcMainInvokeEvent } from "electron";
import { execAsync } from "../util";

const DOWNLOAD_URL =
  "https://github.com/replugged-org/replugged/releases/latest/download/replugged.asar";
const CONFIG_FOLDER_NAMES = ["plugins", "themes", "settings", "quickcss"] as const;

const moveToOrig = async (appDir: string): Promise<void> => {
  // Check if we need to move app.asar to app.orig.asar
  if (!existsSync(join(appDir, "..", "app.orig.asar"))) {
    if (process.platform === "linux") {
      await execAsync(`pkexec mv ${appDir} ${join(appDir, "..", "app.orig.asar")}`);
      return;
    }

    renameSync(appDir, join(appDir, "..", "app.orig.asar"));
  }

  // In case app.asar still exists, delete it
  if (existsSync(appDir)) {
    if (process.platform === "linux") {
      await execAsync(`pkexec rm -rf ${appDir}`);
      return;
    }
    rmSync(appDir, {
      recursive: true,
      force: true,
    });
  }
};

const getConfigDir = (): string => {
  switch (process.platform) {
    case "win32":
      return join(process.env.APPDATA || "", "replugged");
    case "darwin":
      return join(process.env.HOME || "", "Library", "Application Support", "replugged");
    default:
      if (process.env.XDG_CONFIG_HOME) {
        return join(process.env.XDG_CONFIG_HOME, "replugged");
      }
      return join(process.env.HOME || "", ".config", "replugged");
  }
};
const CONFIG_PATH = getConfigDir();

export const download = async (event: IpcMainInvokeEvent): Promise<void> => {
  const entryPoint =
    process.platform == "linux"
      ? join("/", "tmp", "replugged.asar")
      : join(CONFIG_PATH, "replugged.asar");

  const res = await fetch(DOWNLOAD_URL).catch(() => {
    event.sender.send("DOWNLOAD_ERROR");
  });
  if (!res) return;
  if (!res.body) return;

  event.sender.send("DOWNLOAD_PROGRESS", 0);

  // Emit progress events
  const total = Number(res.headers.get("content-length"));
  const chunks: Buffer[] = [];
  let downloaded = 0;
  res.body.on("data", (chunk) => {
    chunks.push(chunk);
    downloaded += chunk.length;
    event.sender.send("DOWNLOAD_PROGRESS", downloaded / total);
  });

  res.body.on("end", async () => {
    if (!existsSync(CONFIG_PATH)) {
      mkdirSync(CONFIG_PATH);
      // Change ownership of config folder to match the parent config folder
      if (process.platform === "linux") {
        const { uid: REAL_UID, gid: REAL_GID } = statSync(join(CONFIG_PATH, ".."));
        chownSync(CONFIG_PATH, REAL_UID, REAL_GID);
        CONFIG_FOLDER_NAMES.forEach((folder) =>
          chownSync(join(CONFIG_PATH, folder), REAL_UID, REAL_GID),
        );
      }
    }
    writeFileSync(entryPoint, Buffer.concat(chunks));
    await execAsync(`pkexec mv ${entryPoint} ${join(CONFIG_PATH, "replugged.asar")}`);

    event.sender.send("DOWNLOAD_DONE");
  });
};

export const inject = async (appDir: string): Promise<void> => {
  const entryPoint = join(CONFIG_PATH, "replugged.asar");

  if (appDir.includes("flatpak")) {
    throw new Error("Flatpak is not supported yet");
    // TODO
  }

  await moveToOrig(appDir);
  const packageJson = JSON.stringify({
    main: "index.js",
    name: "discord",
  });

  if (process.platform === "linux") {
    await execAsync(`pkexec mkdir ${appDir}`);
    await execAsync(
      `pkexec bash -c "echo 'require(\"${entryPoint.replace(
        RegExp(sep.repeat(2), "g"),
        "/",
      )}\")' > ${join(appDir, "index.js")}"`,
    );
    await execAsync(`pkexec bash -c "echo '${packageJson}' > ${join(appDir, "package.json")}"`);
    return;
  }
  mkdirSync(appDir);
  writeFileSync(
    join(appDir, "index.js"),
    `require("${entryPoint.replace(RegExp(sep.repeat(2), "g"), "/")}")`,
  );
  writeFileSync(join(appDir, "package.json"), packageJson);
};

export const uninject = async (appDir: string): Promise<void> => {
  if (process.platform === "linux") {
    await execAsync(`pkexec rm ${appDir}`);
    await execAsync(`pkexec mv ${join(appDir, "..", "app.orig.asar")} ${appDir}`);
    return;
  }
  rmSync(appDir, { recursive: true, force: true });
  renameSync(join(appDir, "..", "app.orig.asar"), appDir);
};
