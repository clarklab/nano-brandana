import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import './index.css'

// Detect when Material Symbols font is loaded and add class to show icons
if (document.fonts) {
  document.fonts.ready.then(() => {
    document.documentElement.classList.add('material-symbols-loaded');
  });
} else {
  // Fallback for browsers without Font Loading API - show after short delay
  setTimeout(() => {
    document.documentElement.classList.add('material-symbols-loaded');
  }, 100);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
