import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createVenueQueryClient } from './lib/session';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import App from './App';
import './styles.css';
import './platform.css';
const client = createVenueQueryClient();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <MotionConfig reducedMotion="user">
          <App />
          <Toaster
            richColors
            position="bottom-right"
            closeButton
            toastOptions={{ className: 'venue-toast' }}
          />
        </MotionConfig>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
