import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// strictPort: fail loudly instead of drifting to 5174, which the server's CORS policy would reject.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
})
