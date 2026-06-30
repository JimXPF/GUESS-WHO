import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getGameSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}
