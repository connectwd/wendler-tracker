import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// IMPORTANT: set `base` to your GitHub repo name (with leading and trailing slashes)
// e.g. if your repo is github.com/yourname/wendler-tracker, base should be '/wendler-tracker/'.
// If you're deploying to a custom domain or a user/org page (yourname.github.io), set base to '/'.
export default defineConfig({
    plugins: [react()],
    base: '/wendler-tracker/',
    build: {
        outDir: 'dist',
    },
});
