const { Client: SelfClient } = require('discord.js-selfbot-v13');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function calistir(token, hedefTipi, hedefId, mesaj, adet, logCallback, durumCallback) {
  let iptal = false;

  function log(mesaj, tip = 'bilgi') {
    if (typeof logCallback === 'function') logCallback(mesaj, tip);
  }

  function durum(d) {
    if (typeof durumCallback === 'function') durumCallback(d);
  }

  function iptalEt() { iptal = true; }

  const selfClient = new SelfClient({
    checkUpdate: false,
    patchVoice: false,
    ws: { properties: { $os: "Windows", $browser: "Discord Client", $device: "Desktop" } }
  });

  selfClient.on('error', (err) => {
    console.error('[SPAM] SelfClient Hatası:', err.message);
  });

  const promise = new Promise((resolve) => {
    (async () => {
      try {
        if (hedefTipi !== 'dm' && hedefTipi !== 'channel') {
          log(`❌ Geçersiz hedef tipi: ${hedefTipi} ("dm" veya "channel")`, 'hata');
          return { basarili: false, tag: '', sent: 0, errors: 1, fatal: 'Geçersiz hedef tipi' };
        }

        await selfClient.login(token);
        const tag = selfClient.user?.tag || 'Hesap';
        log(`🛰️ [${tag}] Spam motoru başlatıldı.`, 'bilgi');
        durum({ phase: 'hazirlik' });

        let target = null;
        if (hedefTipi === 'dm') {
          target = await selfClient.users.fetch(hedefId).catch(() => null);
          if (!target) {
            log(`❌ [${tag}] Kullanıcı bulunamadı! ID'yi kontrol edin.`, 'hata');
            return { basarili: false, tag, sent: 0, errors: 1, fatal: 'Kullanıcı bulunamadı' };
          }
          log(`📋 [${tag}] Hedef: DM → ${target.tag}`, 'bilgi');
        } else {
          target = await selfClient.channels.fetch(hedefId).catch(() => null);
          if (!target) {
            log(`❌ [${tag}] Kanal bulunamadı! ID'yi kontrol edin.`, 'hata');
            return { basarili: false, tag, sent: 0, errors: 1, fatal: 'Kanal bulunamadı' };
          }
          log(`📋 [${tag}] Hedef: Kanal → ${target.name || hedefId}`, 'bilgi');
        }

        const hedef = adet > 0 ? adet : null;
        log(hedef ? `📨 [${tag}] ${hedef} mesaj gönderilecek.` : `📨 [${tag}] Sınırsız mod aktif.`, 'bilgi');

        let sent = 0;
        durum({ phase: 'spam', sent, hedef, hedefTipi, hedefId });

        while (true) {
          if (iptal) {
            log(`⛔ [${tag}] İşlem durduruldu.`, 'uyari');
            return { basarili: false, tag, sent, errors: 0, fatal: 'iptal' };
          }

          try {
            await target.send(mesaj);
            sent++;
            durum({ phase: 'spam', sent, hedef, hedefTipi, hedefId });

            if (sent % 5 === 0) log(`📨 [${tag}] ${sent} mesaj gönderildi.`, 'bilgi');

            if (hedef !== null && sent >= hedef) {
              log(`✅ [${tag}] Hedefe ulaşıldı (${sent} mesaj).`, 'basari');
              durum({ phase: 'bitti', sent, hedef, hedefTipi, hedefId });
              return { basarili: true, tag, sent, errors: 0 };
            }
          } catch (err) {
            console.error('[SPAM] Mesaj gönderme hatası:', err.message);
            log(`⚠️ [${tag}] Mesaj gönderilemedi: ${err.message}`, 'hata');
          }

          await sleep(1000);
        }
      } catch (err) {
        console.error('[SPAM] Fatal Error:', err);
        log(`💥 Kritik hata: ${err.message}`, 'hata');
        return { basarili: false, tag: selfClient.user?.tag || '', sent: 0, errors: 1, fatal: err.message };
      } finally {
        try { selfClient.destroy(); } catch { }
      }
    })().then(resolve).catch((err) => {
      console.error('[SPAM] Beklenmedik hata:', err);
      resolve({ basarili: false, tag: '', sent: 0, errors: 1, fatal: err.message });
    });
  });

  return { promise, iptalEt };
}

module.exports = { calistir };
