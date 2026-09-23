// Free voice-over through Microsoft Edge's "Read aloud" speech service (the protocol the
// edge-tts project uses). No key needed. It is not an official API: fine for personal use,
// check Microsoft's terms before commercial use, and expect occasional breakage when the
// service changes (EDGE_TTS_VERSION / EDGE_TTS_URL can be updated without a code change).
import WebSocket from 'ws';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_VERSION = () => process.env.EDGE_TTS_VERSION || '140.0.3485.14';
const WSS_URL = () => process.env.EDGE_TTS_URL || 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

// A curated set of natural voices; any Edge voice name also works.
export const EDGE_VOICES = [
  { id: 'zh-TW-HsiaoChenNeural', label: '曉臻（台灣・女）' },
  { id: 'zh-TW-HsiaoYuNeural', label: '曉雨（台灣・女）' },
  { id: 'zh-TW-YunJheNeural', label: '雲哲（台灣・男）' },
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓（中国・女）' },
  { id: 'zh-CN-YunxiNeural', label: '云希（中国・男）' },
  { id: 'zh-CN-YunyangNeural', label: '云扬（中国・男・新聞）' },
  { id: 'zh-HK-HiuMaanNeural', label: '曉曼（香港・女）' },
  { id: 'en-US-AvaNeural', label: 'Ava (US, female)' },
  { id: 'en-US-AndrewNeural', label: 'Andrew (US, male)' },
  { id: 'en-US-EmmaNeural', label: 'Emma (US, female)' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (UK, female)' },
  { id: 'ja-JP-NanamiNeural', label: '七海（日本・女）' },
  { id: 'ja-JP-KeitaNeural', label: '圭太（日本・男）' },
  { id: 'ko-KR-SunHiNeural', label: '선히（韓國・女）' },
];

// Sec-MS-GEC: SHA-256 of Windows file time (rounded to 5 minutes) + the client token.
export function secMsGec(now = Date.now()) {
  let ticks = Math.floor(now / 1000) + 11644473600;
  ticks -= ticks % 300;
  return createHash('sha256').update(`${BigInt(ticks) * 10000000n}${TRUSTED_CLIENT_TOKEN}`, 'ascii').digest('hex').toUpperCase();
}

const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const stamp = () => new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');

// Pick a voice matching the text when none is chosen.
export const defaultVoice = (text) => (/[぀-ヿ]/.test(text) ? 'ja-JP-NanamiNeural' : /[가-힯]/.test(text) ? 'ko-KR-SunHiNeural'
  : /[㐀-鿿]/.test(text) ? 'zh-TW-HsiaoChenNeural' : 'en-US-AvaNeural');

// → { buf (mp3), ext: 'mp3' }
export function edgeSpeak(text, { voice, rate = '+0%', pitch = '+0Hz', timeoutMs = 60_000 } = {}) {
  text = String(text || '').trim();
  if (!text) return Promise.reject(new Error('Nothing to say'));
  voice ||= defaultVoice(text);
  if (!/^[a-z]{2,3}-[A-Za-z0-9]{2,4}(-[A-Za-z]+)?-[A-Za-z]+Neural$/.test(voice)) return Promise.reject(new Error(`Unknown Edge voice "${voice}"`));
  const url = `${WSS_URL()}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-${CHROMIUM_VERSION()}&ConnectionId=${randomUUID().replace(/-/g, '')}`;
  const major = CHROMIUM_VERSION().split('.')[0];
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: {
        Pragma: 'no-cache', 'Cache-Control': 'no-cache',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
        'Accept-Encoding': 'gzip, deflate, br', 'Accept-Language': 'en-US,en;q=0.9',
        Cookie: `muid=${randomBytes(16).toString('hex').toUpperCase()};`,
      },
    });
    const chunks = [];
    const timer = setTimeout(() => finish(new Error('Edge voice timed out')), timeoutMs);
    let done = false;
    function finish(err) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      if (err) return reject(err);
      if (!chunks.length) return reject(new Error('Edge voice returned no audio'));
      resolve({ buf: Buffer.concat(chunks), ext: 'mp3' });
    }
    ws.on('open', () => {
      ws.send(`X-Timestamp:${stamp()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n`
        + '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n');
      const lang = voice.split('-').slice(0, 2).join('-');
      ws.send(`X-RequestId:${randomUUID().replace(/-/g, '')}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp()}Z\r\nPath:ssml\r\n\r\n`
        + `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody pitch='${xml(pitch)}' rate='${xml(rate)}' volume='+0%'>${xml(text)}</prosody></voice></speak>`);
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // 2-byte big-endian header length, the header text, then audio bytes.
        const len = data.readUInt16BE(0);
        const header = data.subarray(2, 2 + len).toString();
        if (/Path:audio/.test(header)) chunks.push(data.subarray(2 + len));
      } else if (/Path:turn\.end/.test(data.toString())) finish();
    });
    ws.on('unexpected-response', (_req, res) => finish(new Error(`Edge voice refused the connection (${res.statusCode}); the service may have changed — try updating EDGE_TTS_VERSION`)));
    ws.on('error', (e) => finish(new Error(`Edge voice: ${e.message}`)));
    ws.on('close', () => finish(chunks.length ? null : new Error('Edge voice closed without audio')));
  });
}
