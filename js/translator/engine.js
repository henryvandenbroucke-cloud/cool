/**
 * BABEL engine — chunking + 3-engine fallback chain.
 * 1. Same-origin proxy (/api/translate, served by server.mjs → Google, no CORS issues)
 * 2. Google Translate direct (gtx endpoint)
 * 3. MyMemory direct
 * Every engine returns { text, detected, engine, alternatives? }
 */

/** Split text into <=max-char chunks on paragraph / sentence boundaries. */
export function chunkText(text, max = 420) {
  if (text.length <= max) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.4) cut = Math.max(
      rest.lastIndexOf('. ', max), rest.lastIndexOf('! ', max),
      rest.lastIndexOf('? ', max), rest.lastIndexOf('। ', max),
    );
    if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    else cut += 1;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function parseGoogle(json) {
  if (!json || !Array.isArray(json[0])) throw new Error('Bad Google response');
  return {
    text: json[0].map((seg) => (Array.isArray(seg) ? seg[0] || '' : '')).join(''),
    detected: json[2] || null,
  };
}

const myMemoryCode = (c) => (c === 'he' ? 'iw' : c === 'zh-CN' ? 'zh-CN' : c === 'zh-TW' ? 'zh-TW' : c.split('-')[0] === 'mni' ? 'en' : c);

async function viaProxy(text, sl, tl, fetchFn) {
  const r = await fetchFn(`/api/translate?sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`);
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  const j = await r.json();
  if (!j.translated && j.translated !== '') throw new Error('proxy empty');
  return { text: j.translated, detected: j.detected || null, engine: 'BABEL Cloud' };
}

async function viaGoogle(text, sl, tl, fetchFn) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`google ${r.status}`);
  const parsed = parseGoogle(await r.json());
  return { ...parsed, engine: 'Google Translate' };
}

async function viaMyMemory(text, sl, tl, fetchFn) {
  const from = sl === 'auto' ? 'autodetect' : myMemoryCode(sl);
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(from + '|' + myMemoryCode(tl))}`;
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`mymemory ${r.status}`);
  const j = await r.json();
  const translated = j?.responseData?.translatedText;
  if (!translated) throw new Error('mymemory empty');
  const alternatives = [...new Set((j.matches || []).map((m) => m.translation).filter((t) => t && t.toLowerCase() !== translated.toLowerCase()))].slice(0, 4);
  return { text: translated, detected: j.responseData.detectedLanguage || null, engine: 'MyMemory', alternatives };
}

/** Offline essentials — greetings & survival phrases that work with zero network. */
export const OFFLINE = {
  'hello': { es:'Hola', fr:'Bonjour', de:'Hallo', it:'Ciao', pt:'Olá', nl:'Hallo', ru:'Привет', ja:'こんにちは', ko:'안녕하세요', 'zh-CN':'你好', ar:'مرحبا', hi:'नमस्ते', uk:'Привіт', pl:'Cześć', tr:'Merhaba', sv:'Hej', el:'Γεια σας', he:'שלום', th:'สวัสดี', vi:'Xin chào', id:'Halo', sw:'Jambe' },
  'thank you': { es:'Gracias', fr:'Merci', de:'Danke', it:'Grazie', pt:'Obrigado', nl:'Dank je', ru:'Спасибо', ja:'ありがとう', ko:'감사합니다', 'zh-CN':'谢谢', ar:'شكرا لك', hi:'धन्यवाद', uk:'Дякую', pl:'Dziękuję', tr:'Teşekkür ederim', sv:'Tack', el:'Ευχαριστώ', he:'תודה', th:'ขอบคุณ', vi:'Cảm ơn', id:'Terima kasih', sw:'Asante' },
  'thank you very much': { es:'Muchas gracias', fr:'Merci beaucoup', de:'Vielen Dank', it:'Grazie mille', pt:'Muito obrigado', nl:'Hartelijk dank', ru:'Большое спасибо', ja:'どうもありがとうございます', ko:'대단히 감사합니다', 'zh-CN':'非常感谢', ar:'شكرا جزيلا', hi:'बहुत-बहुत धन्यवाद', uk:'Дуже дякую', pl:'Dziękuję bardzo', tr:'Çok teşekkür ederim', sv:'Tack så mycket', el:'Ευχαριστώ πολύ', he:'תודה רבה', th:'ขอบคุณมาก', vi:'Cảm ơn rất nhiều', id:'Terima kasih banyak', sw:'Asante sana' },
  'please': { es:'Por favor', fr:'S’il vous plaît', de:'Bitte', it:'Per favore', pt:'Por favor', nl:'Alsjeblieft', ru:'Пожалуйста', ja:'お願いします', ko:'제발', 'zh-CN':'请', ar:'من فضلك', hi:'कृपया', uk:'Будь ласка', pl:'Proszę', tr:'Lütfen', sv:'Snälla', el:'Παρακαλώ', he:'בבקשה', th:'กรุณา', vi:'Làm ơn', id:'Silakan', sw:'Tafadhali' },
  'goodbye': { es:'Adiós', fr:'Au revoir', de:'Auf Wiedersehen', it:'Arrivederci', pt:'Adeus', nl:'Tot ziens', ru:'До свидания', ja:'さようなら', ko:'안녕히 가세요', 'zh-CN':'再见', ar:'وداعا', hi:'अलविदा', uk:'До побачення', pl:'Do widzenia', tr:'Hoşça kal', sv:'Hej då', el:'Αντίο', he:'להתראות', th:'ลาก่อน', vi:'Tạm biệt', id:'Selamat tinggal', sw:'Kwaheri' },
  'yes': { es:'Sí', fr:'Oui', de:'Ja', it:'Sì', pt:'Sim', nl:'Ja', ru:'Да', ja:'はい', ko:'네', 'zh-CN':'是', ar:'نعم', hi:'हाँ', uk:'Так', pl:'Tak', tr:'Evet', sv:'Ja', el:'Ναι', he:'כן', th:'ใช่', vi:'Vâng', id:'Ya', sw:'Ndiyo' },
  'no': { es:'No', fr:'Non', de:'Nein', it:'No', pt:'Não', nl:'Nee', ru:'Нет', ja:'いいえ', ko:'아니요', 'zh-CN':'不', ar:'لا', hi:'नहीं', uk:'Ні', pl:'Nie', tr:'Hayır', sv:'Nej', el:'Όχι', he:'לא', th:'ไม่', vi:'Không', id:'Tidak', sw:'Hapana' },
  'i love you': { es:'Te quiero', fr:'Je t’aime', de:'Ich liebe dich', it:'Ti amo', pt:'Eu te amo', nl:'Ik hou van je', ru:'Я тебя люблю', ja:'愛してる', ko:'사랑해', 'zh-CN':'我爱你', ar:'أحبك', hi:'मैं तुमसे प्यार करता हूँ', uk:'Я тебе кохаю', pl:'Kocham cię', tr:'Seni seviyorum', sv:'Jag älskar dig', el:'Σ’ αγαπώ', he:'אני אוהב אותך', th:'ฉันรักคุณ', vi:'Anh yêu em', id:'Aku cinta kamu', sw:'Ninakupenda' },
  'good morning': { es:'Buenos días', fr:'Bonjour', de:'Guten Morgen', it:'Buongiorno', pt:'Bom dia', nl:'Goedemorgen', ru:'Доброе утро', ja:'おはようございます', ko:'좋은 아침', 'zh-CN':'早上好', ar:'صباح الخير', hi:'सुप्रभात', uk:'Доброго ранку', pl:'Dzień dobry', tr:'Günaydın', sv:'God morgon', el:'Καλημέρα', he:'בוקר טוב', th:'อรุณสวัสดิ์', vi:'Chào buổi sáng', id:'Selamat pagi', sw:'Habari za asubuhi' },
  'good night': { es:'Buenas noches', fr:'Bonne nuit', de:'Gute Nacht', it:'Buonanotte', pt:'Boa noite', nl:'Goedenacht', ru:'Спокойной ночи', ja:'おやすみ', ko:'안녕히 주무세요', 'zh-CN':'晚安', ar:'تصبح على خير', hi:'शुभ रात्रि', uk:'На добраніч', pl:'Dobranoc', tr:'İyi geceler', sv:'God natt', el:'Καληνύχτα', he:'לילה טוב', th:'ราตรีสวัสดิ์', vi:'Chúc ngủ ngon', id:'Selamat malam', sw:'Usiku mwema' },
  'welcome': { es:'Bienvenido', fr:'Bienvenue', de:'Willkommen', it:'Benvenuto', pt:'Bem-vindo', nl:'Welkom', ru:'Добро пожаловать', ja:'ようこそ', ko:'환영합니다', 'zh-CN':'欢迎', ar:'أهلا بك', hi:'स्वागत है', uk:'Ласкаво просимо', pl:'Witaj', tr:'Hoş geldiniz', sv:'Välkommen', el:'Καλώς ήρθατε', he:'ברוך הבא', th:'ยินดีต้อนรับ', vi:'Chào mừng', id:'Selamat datang', sw:'Karibu' },
  'happy birthday': { es:'Feliz cumpleaños', fr:'Joyeux anniversaire', de:'Alles Gute zum Geburtstag', it:'Buon compleanno', pt:'Feliz aniversário', nl:'Gefeliciteerd', ru:'С днём рождения', ja:'お誕生日おめでとう', ko:'생일 축하해', 'zh-CN':'生日快乐', ar:'عيد ميلاد سعيد', hi:'जन्मदिन मुबारक', uk:'З днем народження', pl:'Wszystkiego najlepszego', tr:'Doğum günün kutlu olsun', sv:'Grattis på födelsedagen', el:'Χρόνια πολλά', he:'יום הולדת שמח', th:'สุขสันต์วันเกิด', vi:'Chúc mừng sinh nhật', id:'Selamat ulang tahun', sw:'Heri ya kuzaliwa' },
  'cheers': { es:'Salud', fr:'Santé', de:'Prost', it:'Salute', pt:'Saúde', nl:'Proost', ru:'Будем', ja:'乾杯', ko:'건배', 'zh-CN':'干杯', ar:'في صحتك', hi:'चियर्स', uk:'Будьмо', pl:'Na zdrowie', tr:'Şerefe', sv:'Skål', el:'Στην υγειά σας', he:'לחיים', th:'ไชโย', vi:'Cạn ly', id:'Pro', sw:'Maisha marefu' },
  'excuse me': { es:'Disculpe', fr:'Excusez-moi', de:'Entschuldigung', it:'Mi scusi', pt:'Com licença', nl:'Pardon', ru:'Извините', ja:'すみません', ko:'실례합니다', 'zh-CN':'打扰一下', ar:'عذرا', hi:'क्षमा करें', uk:'Вибачте', pl:'Przepraszam', tr:'Affedersiniz', sv:'Ursäkta', el:'Συγγνώμη', he:'סליחה', th:'ขอโทษ', vi:'Xin lỗi', id:'Permisi', sw:'Samahani' },
};
function offlineLookup(text, tl) {
  const key = text.trim().toLowerCase().replace(/[!！.。…]+$/u, '');
  const hit = OFFLINE[key]?.[tl] || OFFLINE[key]?.[tl.split('-')[0]];
  return hit ? { text: hit, detected: 'en', engine: 'Offline essentials ⚡' } : null;
}

/** Translate full text (any length) with automatic fallback. */
export async function translateText(text, sl, tl, fetchFn = fetch) {
  if (sl === 'en' || sl === 'auto') { const off = offlineLookup(text, tl); if (off && chunkText(text).length === 1 && text.length <= 40) return off; }
  const chunks = chunkText(text);
  const parts = [];
  let detected = null, engine = '', alternatives = [];
  for (const chunk of chunks) {
    const chain = [viaGoogle, viaProxy, viaMyMemory];
    let lastErr;
    let done = null;
    for (const attempt of chain) {
      try { done = await attempt(chunk, sl, tl, fetchFn); break; } catch (e) { lastErr = e; }
    }
    if (!done) { const off = offlineLookup(chunk, tl); if (off) done = off; else throw lastErr || new Error('All translation engines failed'); }
    parts.push(done.text);
    detected = detected || done.detected;
    engine = done.engine;
    if (done.alternatives?.length && !alternatives.length) alternatives = done.alternatives;
  }
  return { text: parts.join(''), detected, engine, alternatives };
}

/** Single-word dictionary lookup (English source words). */
export async function lookupWord(word, fetchFn = fetch) {
  const r = await fetchFn(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!r.ok) return null;
  const j = await r.json();
  const entry = Array.isArray(j) ? j[0] : null;
  if (!entry) return null;
  const meaning = entry.meanings?.[0];
  return {
    phonetic: entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || '',
    partOfSpeech: meaning?.partOfSpeech || '',
    definition: meaning?.definitions?.[0]?.definition || '',
    example: meaning?.definitions?.[0]?.example || '',
  };
}
