const { app, BrowserWindow, ipcMain, nativeImage, Tray, Menu, shell, Notification } = require('electron');
const path = require('path');
const fs   = require('fs');
const bot  = require('./bot');

const appIconYolu = path.join(__dirname, '..', 'images', 'uygulama.png');
let appIcon = nativeImage.createEmpty();
try {
  appIcon = nativeImage.createFromBuffer(fs.readFileSync(appIconYolu));
} catch (_) {}
const dataFile = path.join(app.getPath('userData'), 'ayarlar.json');

let win;
let tray;
const aktifIslemler = new Map();

function ayarOku() {
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch { return {}; }
}

function ayarYaz(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
}

function createWindow() {
  app.setAppUserModelId('Mesaj Spam');

  win = new BrowserWindow({
    width: 500,
    height: 790,
    resizable: false,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'Mesaj Spam',
    icon: appIcon,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    autoHideMenuBar: true,
    opacity: 0,
  });

  win.loadFile(path.join(__dirname, 'renderer.html'));

  win.once('ready-to-show', () => {
    win.show();
    let op = 0;
    const fade = setInterval(() => {
      op = Math.min(op + 0.07, 1);
      win.setOpacity(op);
      if (op >= 1) clearInterval(fade);
    }, 16);
  });

  win.on('close', (e) => {
    e.preventDefault();
    win.hide();
  });
}

function createTray() {
  tray = new Tray(appIcon.isEmpty() ? nativeImage.createEmpty() : appIcon);
  tray.setToolTip('Mesaj Spam');

  const menu = Menu.buildFromTemplate([
    { label: 'Aç',   click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { app.exit(0); } },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => { win.show(); win.focus(); });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => { aktifIslemler.forEach((islem) => islem.iptalEt()); });

ipcMain.on('minimize',  () => win.minimize());
ipcMain.on('kapat',     () => win.hide());
ipcMain.on('openLink',  (_, url) => shell.openExternal(url));

ipcMain.handle('ayarOku',  () => ayarOku());
ipcMain.handle('ayarYaz',  (_, data) => { ayarYaz(data); return true; });

function bildirimGoster({ baslik, mesaj }) {
  if (!Notification.isSupported()) return;
  try {
    new Notification({ title: baslik, body: mesaj, icon: appIcon.isEmpty() ? undefined : appIcon }).show();
  } catch (_) {}
}

ipcMain.handle('baslat', async (_, { tokenler, hedefTipi, hedefId, mesaj, adet }) => {
  const islemler = tokenler.map((token) => {
    const islem = bot.calistir(token, hedefTipi, hedefId, mesaj, adet,
      (m, tip) => win.webContents.send('log', { mesaj: m, tip }),
      (durum) => win.webContents.send('durum', { token, ...durum })
    );
    aktifIslemler.set(token, islem);
    return islem.promise.finally(() => aktifIslemler.delete(token));
  });

  const sonuclar = await Promise.all(islemler);

  const toplam = sonuclar.reduce((a, s) => a + (s.sent || 0), 0);
  const iptal = sonuclar.some((s) => s.fatal === 'iptal');
  const hata = sonuclar.filter((s) => !s.basarili && s.fatal !== 'iptal').length;

  if (iptal) {
    bildirimGoster({ baslik: 'Mesaj Spam Durduruldu', mesaj: `${toplam} mesaj gönderildi.` });
  } else if (hata > 0) {
    bildirimGoster({ baslik: 'Mesaj Spam Başarısız', mesaj: `${hata} hesapta hata oluştu. ${toplam} mesaj gönderildi.` });
  } else {
    bildirimGoster({ baslik: 'Mesaj Spam Tamamlandı', mesaj: `${toplam} mesaj gönderildi (${sonuclar.length} hesap).` });
  }
  shell.beep();

  return sonuclar;
});

ipcMain.on('durdur', () => {
  aktifIslemler.forEach((islem) => islem.iptalEt());
  aktifIslemler.clear();
  win.webContents.send('log', { mesaj: 'Durdurma isteği iletildi.', tip: 'uyari' });
});
