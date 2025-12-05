/**
 * Simple terminal spinner for CLI progress indication.
 */

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL_MS = 80;

export interface Spinner {
  start: (text: string) => void;
  update: (text: string) => void;
  succeed: (text: string) => void;
  fail: (text: string) => void;
  stop: () => void;
}

/**
 * Create a new spinner instance.
 */
export const createSpinner = (): Spinner => {
  let frameIndex = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let currentText = "";

  const clearLine = () => {
    process.stdout.write("\r\x1b[K");
  };

  const render = () => {
    clearLine();
    process.stdout.write(`${FRAMES[frameIndex]} ${currentText}`);
    frameIndex = (frameIndex + 1) % FRAMES.length;
  };

  return {
    start: (text: string) => {
      currentText = text;
      frameIndex = 0;
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(render, INTERVAL_MS);
      render();
    },

    update: (text: string) => {
      currentText = text;
    },

    succeed: (text: string) => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      clearLine();
      console.log(`\x1b[32m✓\x1b[0m ${text}`);
    },

    fail: (text: string) => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      clearLine();
      console.log(`\x1b[31m✗\x1b[0m ${text}`);
    },

    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      clearLine();
    },
  };
};
