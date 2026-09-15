import type { MessageDto, AttachmentDto } from "@/services/chatService";
import { isAudio } from "@/utils/fileUtils";

const BREAK = "__break__";

type PlayerHandle = {
  play: () => void;
  pause: () => void;
};

const players = new Map<string, PlayerHandle>();
let sequence: string[] = [];
let activeKey: string | null = null;
let exclusiveInstalled = false;
let chainTimer: ReturnType<typeof setTimeout> | null = null;

export function audioPlaybackKey(messageId: number, attachmentId: number): string {
  return `${messageId}:${attachmentId}`;
}

export function isPlayableAudioAttachment(messageType: string | undefined, att: AttachmentDto): boolean {
  if (messageType === "voice") return true;
  return isAudio(att.fileType, att.fileName);
}

function isPlayableAudioMessage(msg: MessageDto): boolean {
  if (msg.isDeleted || msg.messageType === "system") return false;
  return (msg.attachments ?? []).some((att) => isPlayableAudioAttachment(msg.messageType, att));
}

export function setAudioSequence(messages: MessageDto[]): void {
  const next: string[] = [];
  for (const msg of messages) {
    if (!isPlayableAudioMessage(msg)) {
      if (next.length > 0 && next[next.length - 1] !== BREAK) next.push(BREAK);
      continue;
    }
    for (const att of msg.attachments ?? []) {
      if (isPlayableAudioAttachment(msg.messageType, att)) {
        next.push(audioPlaybackKey(msg.id, att.id));
      }
    }
  }
  sequence = next;
}

function nextConsecutiveKey(key: string): string | null {
  const i = sequence.indexOf(key);
  if (i < 0) return null;
  const n = sequence[i + 1];
  if (!n || n === BREAK) return null;
  return n;
}

function clearChainTimer() {
  if (chainTimer) {
    clearTimeout(chainTimer);
    chainTimer = null;
  }
}

export function ensureExclusiveAudio(): void {
  if (exclusiveInstalled || typeof document === "undefined") return;
  exclusiveInstalled = true;
  document.addEventListener(
    "play",
    (e) => {
      const target = e.target;
      if (!(target instanceof HTMLAudioElement)) return;
      document.querySelectorAll("audio").forEach((el) => {
        if (el !== target && !el.paused) el.pause();
      });
    },
    true,
  );
}

export function registerAudioPlayer(key: string, handle: PlayerHandle): () => void {
  ensureExclusiveAudio();
  players.set(key, handle);
  if (activeKey === key) handle.play();
  return () => {
    players.delete(key);
    if (activeKey === key) activeKey = null;
  };
}

export function requestAudioPlay(key: string): void {
  ensureExclusiveAudio();
  clearChainTimer();
  if (activeKey && activeKey !== key) {
    players.get(activeKey)?.pause();
  }
  activeKey = key;
  const handle = players.get(key);
  if (handle) {
    handle.play();
    return;
  }
  // Not mounted yet — keep the key so a late register can start.
}

export function notifyAudioPaused(key: string): void {
  if (activeKey !== key) return;
  activeKey = null;
  clearChainTimer();
}

export function notifyAudioEnded(key: string): void {
  if (activeKey === key) activeKey = null;
  const next = nextConsecutiveKey(key);
  if (!next) return;
  clearChainTimer();
  chainTimer = setTimeout(() => {
    chainTimer = null;
    requestAudioPlay(next);
  }, 220);
}
