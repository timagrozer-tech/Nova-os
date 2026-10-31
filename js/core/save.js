/* Сохранения: localStorage + контрольная сумма + резервная копия + импорт/экспорт JSON.
   Ничего не отправляется в сеть. */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U;
  const Save = SN.Save = {};
  Save.KEY = 's-nulya-save-v2';
  Save.BAK = 's-nulya-save-v2-backup';
  Save.LEGACY = 's-nulya-life-demo-v1';
  Save.MAX = 1024 * 1024;

  const store = () => { try { return G.localStorage; } catch (e) { return null; } };
  Save.pack = s => { const data = JSON.stringify(s); return JSON.stringify({ format: 's-nulya-save', v: s.v, game: SN.VERSION, at: Date.now(), hash: U.hash(data), data }); };
  Save.unpack = function (txt) {
    if (typeof txt !== 'string' || txt.length > Save.MAX) throw Error('size');
    const o = JSON.parse(txt);
    // Формат v2: обёртка с хешем
    if (o && o.format === 's-nulya-save') {
      if (typeof o.data !== 'string' || U.hash(o.data) !== o.hash) throw Error('hash');
      return SN.migrate(JSON.parse(o.data));
    }
    // Старый формат прототипа: голый объект
    if (o && Number.isFinite(o.day) && Number.isFinite(o.money)) return SN.migrate(Object.assign({ v: 1 }, o));
    throw Error('format');
  };

  Save.write = function (s) {
    const st = store(); if (!st) return false;
    try {
      const prev = st.getItem(Save.KEY);
      if (prev) st.setItem(Save.BAK, prev);
      st.setItem(Save.KEY, Save.pack(s));
      return true;
    } catch (e) { console.warn('save failed', e); return false; }
  };
  /* Загрузка: основное → резервное → прототип → новая игра */
  Save.read = function () {
    const st = store(); const res = { state: null, source: 'new', warn: '' };
    if (!st) return res;
    for (const [k, src] of [[Save.KEY, 'main'], [Save.BAK, 'backup']]) {
      const raw = st.getItem(k); if (!raw) continue;
      try { res.state = Save.unpack(raw); res.source = src; if (src === 'backup') res.warn = 'Основное сохранение повреждено — загружена резервная копия.'; return res; }
      catch (e) { res.warn = 'Сохранение повреждено (' + e.message + ').'; }
    }
    const legacy = st.getItem(Save.LEGACY);
    if (legacy) { try { res.state = Save.unpack(legacy); res.source = 'legacy'; res.warn = 'Прогресс из прототипа перенесён в новую версию.'; return res; } catch (e) { /* игнор */ } }
    return res;
  };
  Save.clear = () => { const st = store(); if (st) { st.removeItem(Save.KEY); st.removeItem(Save.BAK); } };
  Save.exportText = s => Save.pack(s);
  Save.importText = txt => Save.unpack(txt);
})(typeof window !== 'undefined' ? window : globalThis);
