import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The site has two pages: the landing page at / and the playground at /playground/.
export default defineConfig({
  server: { port: 5173 },
  build: {
    rolldownOptions: {
      input: { main: page('index.html'), playground: page('playground/index.html') },
    },
  },
});
