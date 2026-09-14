import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/apps/kachun-quizer/',
  plugins: [react()],
});
