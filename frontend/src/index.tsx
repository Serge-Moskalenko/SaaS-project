import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

import { ClerkProvider } from '@clerk/clerk-react';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ClerkProvider publishableKey={process.env.REACT_APP_CLERK_PUBLISHABLE_KEY}>
    <App />
  </ClerkProvider>
);

