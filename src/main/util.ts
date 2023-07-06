import { URL } from "url";
import path from "path";
import { promisify } from "util";
import { exec } from "child_process";

export function resolveHtmlPath(htmlFileName: string): string {
  if (process.env.NODE_ENV === "development") {
    const port = process.env.PORT || 1212;
    const url = new URL(`http://localhost:${port}`);
    url.pathname = htmlFileName;
    return url.href;
  }
  return `file://${path.resolve(__dirname, "../renderer/", htmlFileName)}`;
}

export const execAsync = promisify(exec);
