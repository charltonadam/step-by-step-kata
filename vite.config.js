import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (name) => fileURLToPath(new URL(name, import.meta.url));

// Two pages: the control window (laptop screen) and the projector window.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: page('index.html'),
        projector: page('projector.html'),
      },
    },
  },
});
