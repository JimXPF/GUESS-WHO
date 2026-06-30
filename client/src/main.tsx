import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { GameRoomProvider } from './hooks/useGameRoom';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <GameRoomProvider>
        <App />
      </GameRoomProvider>
    </BrowserRouter>
  </React.StrictMode>
);
