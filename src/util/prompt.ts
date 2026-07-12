import { createInterface } from "node:readline";

const CTRL_C = String.fromCharCode(3);
const BACKSPACE_DEL = String.fromCharCode(127);
const BACKSPACE_BS = String.fromCharCode(8);

/**
 * Prompts for a plain-text value (non-secret). Echoes normally.
 */
export function promptText(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompts for a secret value (API key, client secret, password) without
 * echoing it back to the terminal -- masks each keystroke as it's typed
 * so a secret never appears in scrollback or a screen-share.
 */
export function promptSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let value = "";

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = (): void => {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw ?? false);
      }
      stdin.pause();
    };

    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === "\n" || char === "\r") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === CTRL_C) {
          cleanup();
          process.stdout.write("\n");
          process.exit(130);
        }
        if (char === BACKSPACE_DEL || char === BACKSPACE_BS) {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        value += char;
        process.stdout.write("*");
      }
    };

    stdin.on("data", onData);
  });
}
