import { mkdir, rm, stat } from "node:fs/promises";
import { accountPath } from "./paths.ts";

const STALE_LOCK_MS = 120_000;
const LOCK_WAIT_MS = 10_000;

export async function withAccountLock<T>(
  home: string,
  operation: () => Promise<T>
): Promise<T> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  const lock = `${accountPath(home)}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      await mkdir(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - (await stat(lock)).mtimeMs > STALE_LOCK_MS) {
          await rm(lock, { recursive: true, force: true });
          continue;
        }
      } catch (metadataError) {
        if ((metadataError as NodeJS.ErrnoException).code === "ENOENT")
          continue;
        throw metadataError;
      }
      if (Date.now() >= deadline)
        throw new Error("Cocode account is busy in another client");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  try {
    return await operation();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
