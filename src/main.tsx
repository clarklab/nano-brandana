import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import './index.css'
import './lib/auth-debug' // Enable window.debugAuth() for debugging

// Detect when Material Symbols font is loaded and add class to show icons
const showMaterialIcons = () => {
  document.documentElement.classList.add('material-symbols-loaded');
};

const checkMaterialSymbolsFont = () => {
  // Check if Material Symbols Outlined font is available
  return document.fonts.check('16px "Material Symbols Outlined"');
};

if (document.fonts) {
  // Wait for fonts to be ready, then specifically check for Material Symbols
  document.fonts.ready.then(() => {
    if (checkMaterialSymbolsFont()) {
      showMaterialIcons();
    } else {
      // Font not yet loaded, try to load it explicitly and poll for availability
      document.fonts.load('16px "Material Symbols Outlined"').then(() => {
        showMaterialIcons();
      }).catch(() => {
        // If explicit load fails, poll for font availability
        const pollInterval = setInterval(() => {
          if (checkMaterialSymbolsFont()) {
            clearInterval(pollInterval);
            showMaterialIcons();
          }
        }, 100);
        // Stop polling after 5 seconds and show anyway
        setTimeout(() => {
          clearInterval(pollInterval);
          showMaterialIcons();
        }, 5000);
      });
    }
  });
} else {
  // Fallback for browsers without Font Loading API - show after short delay
  setTimeout(() => {
    showMaterialIcons();
  }, 500);
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
