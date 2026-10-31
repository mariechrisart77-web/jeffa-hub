import { secMsGec } from "./edge-gec";
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const GEC_VERSION = "2-143.0.3650.75";
const CHROMIUM_MAJOR = "143";
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

export async function generateSecMsGec(nowSec: number = Date.now() / 1000): Promise<string> {
  return secMsGec(TRUSTED_CLIENT_TOKEN, nowSec);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function dateString(): string {
  return new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
}

function requestId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export interface EdgeTTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  signal?: AbortSignal;
}

export async function edgeTTS(text: string, options: EdgeTTSOptions = {}): Promise<Uint8Array> {
  const voice = options.voice || "de-DE-SeraphinaMultilingualNeural";
  const rate = Math.max(0.5, Math.min(2, options.rate || 1));
  const pitch = Math.max(0.5, Math.min(2, options.pitch || 1));
  const pitchHz = Math.round((pitch - 1) * 50);
  const ratePercent = Math.round((rate - 1) * 100);
  const gec = await generateSecMsGec();
  const id = requestId();
  const url = `${WSS_URL}&ConnectionId=${id}&Sec-MS-GEC=${encodeURIComponent(gec)}&Sec-MS-GEC-Version=${encodeURIComponent(GEC_VERSION)}`;
  const response = await fetch(url.replace(/^wss:/, "https:"), {
    headers: {
      "Upgrade": "websocket",
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`,
      "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "Pragma": "no-cache",
      "Cache-Control": "no-cache",
    },
    signal: options.signal,
  });
  if (!response.webSocket) {
    throw new Error(`Edge TTS WebSocket fehlgeschlagen (${response.status})`);
  }

  const client = response.webSocket;
  client.accept();
  const chunks: Uint8Array[] = [];
  const timeout = AbortSignal.timeout(20000);
  const combinedSignal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  try {
    const config = `X-Timestamp:${dateString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='de-DE'><voice name='${voice}'><prosody pitch='${pitchHz >= 0 ? "+" : ""}${pitchHz}Hz' rate='${ratePercent >= 0 ? "+" : ""}${ratePercent}%' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
    const ssmlMessage = `X-RequestId:${id}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${dateString()}Z\r\nPath:ssml\r\n\r\n${ssml}`;
    client.send(config);
    client.send(ssmlMessage);

    const audio = await new Promise<Uint8Array>((resolve, reject) => {
      let total = 0;
      const output = new Uint8Array(1024 * 1024);
      const onMessage = (event: MessageEvent) => {
        if (typeof event.data === "string") {
          if (event.data.includes("Path:turn.end")) {
            client.close(1000, "done");
            resolve(output.slice(0, total));
          }
          return;
        }
        const message = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : new Uint8Array(event.data as ArrayBufferLike);
        if (message.length < 2) return;
        const headerLength = (message[0] << 8) | message[1];
        const header = new TextDecoder().decode(message.slice(2, 2 + headerLength));
        if (!header.toLowerCase().includes("path:audio")) return;
        const audioData = message.slice(2 + headerLength);
        if (!audioData.length) return;
        if (total + audioData.length > output.length) {
          reject(new Error("Edge TTS Audio zu groß"));
          client.close(1011, "too large");
          return;
        }
        output.set(audioData, total);
        total += audioData.length;
      };
      client.addEventListener("message", onMessage);
      client.addEventListener("close", () => {
        if (total > 0) resolve(output.slice(0, total));
        else reject(new Error("Edge TTS-Verbindung ohne Audio beendet"));
      });
      client.addEventListener("error", () => reject(new Error("Edge TTS WebSocket-Fehler")));
      combinedSignal.addEventListener("abort", () => {
        client.close(1011, "timeout");
        reject(new Error("Edge TTS Timeout"));
      });
    });
    if (!audio.length) throw new Error("Edge TTS lieferte keine Audiodaten");
    return audio;
  } finally {
    try { client.close(1000, "done"); } catch { /* already closed */ }
  }
}
