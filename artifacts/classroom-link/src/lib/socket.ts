import { io, type Socket } from 'socket.io-client';
import { useEffect, useState, useCallback } from 'react';

export const MAX_LEN = 2000;
export type Sentence = { text: string; sentAt: string | null };
export type Status = 'connecting' | 'online' | 'offline';
type Ack = { ok: true } | { ok: false; error: string };

let socket: Socket | null = null;
function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: `${import.meta.env.BASE_URL}socket.io` });
  }
  return socket;
}

export function useClassroomLink() {
  const [status, setStatus] = useState<Status>(() => (getSocket().connected ? 'online' : 'connecting'));
  const [sentence, setSentence] = useState<Sentence | null>(null);

  useEffect(() => {
    const s = getSocket();
    const onConnect = () => setStatus('online');
    const onDisconnect = () => setStatus('offline');
    const onError = () => setStatus('offline');
    const onUpdate = (p: Sentence) => setSentence({ text: p?.text ?? '', sentAt: p?.sentAt ?? null });
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onError);
    s.on('sentence:updated', onUpdate);
    if (s.connected) setStatus('online');
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onError);
      s.off('sentence:updated', onUpdate);
    };
  }, []);

  const send = useCallback((text: string) => new Promise<void>((resolve, reject) => {
    const s = getSocket();
    if (!s.connected) return reject(new Error('Not connected. Nothing was sent.'));
    s.timeout(5000).emit('sentence:send', text, (err: Error | null, res?: Ack) => {
      if (err) return reject(new Error('No reply from the server within 5 seconds. Try again.'));
      if (!res || !res.ok) return reject(new Error(res && !res.ok ? res.error : 'Send failed.'));
      resolve();
    });
  }), []);

  return { status, sentence, send };
}

export function formatTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}
