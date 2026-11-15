/**
 * 飛灣鐵路公司 — 客流模式、動態乘車率、OD 統計與財務精算共用引擎
 * 依據《飛灣鐵路 — 客流模式與動態乘車率規劃書》建置
 * 全面採用偽隨機種子碼 (Mulberry32) + Box-Muller 常態分布，確保各終端顯示完全一致。
 * 匯率基準：1 飛灣幣 (FWC) = 10 美元 (USD)
 */
(function (global) {
  'use strict';

  const USD_PER_FWC = 10;

  // =========================================================
  // 1. 偽隨機種子碼 (Mulberry32) + 常態分布 (Box-Muller)
  // =========================================================
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function createRNG(seedInput) {
    let a = (typeof seedInput === 'number') ? (seedInput >>> 0) : hashSeed(seedInput);
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randNormal(rng, mean = 0, stdDev = 1, minVal = -Infinity, maxVal = Infinity) {
    const u1 = Math.max(1e-9, rng());
    const u2 = rng();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const val = mean + z * stdDev;
    return Math.max(minVal, Math.min(maxVal, val));
  }

  // =========================================================
  // 2. 車站土地利用分類、規模等級與轉乘定義 (全線 22 站)
  // =========================================================
  const STATION_PROFILES = [
    { idx: 0,  code: 'FR01', name: '飛灣工業區',   distM: 0,     km: 0.0,  exp: true,  scale: 4, landUse: { C: 1.0 }, landLabel: 'C', transfers: ['地鐵工業線 (T1)', '地鐵環狀線 (T1)'], note: '' },
    { idx: 1,  code: 'FR02', name: '飛灣港',       distM: 7300,  km: 7.3,  exp: false, scale: 3, landUse: { H: 1.0 }, landLabel: 'H', transfers: ['地鐵環狀線 (T1)'], note: '' },
    { idx: 2,  code: 'FR03', name: '物流中心',     distM: 8600,  km: 8.5,  exp: false, scale: 3, landUse: { H: 1.0 }, landLabel: 'H', transfers: ['地鐵環狀線 (T1)'], note: '' },
    { idx: 3,  code: 'FR04', name: '飛灣郵輪港',   distM: 9800,  km: 9.7,  exp: true,  scale: 5, landUse: { B: 0.2, H: 0.3, G: 0.5 }, landLabel: '20%B+30%H+50%G', transfers: ['WRT環島線 (城際幹線)', '地鐵中央線 (T1)', '地鐵環狀線 (T1)'], note: '城際長途樞紐，連假前後波峰顯著' },
    { idx: 4,  code: 'FR05', name: '濱江商務區',   distM: 17000, km: 16.9, exp: false, scale: 4, landUse: { B: 1.0 }, landLabel: 'B', transfers: ['地鐵環狀線 (T1)'], note: '' },
    { idx: 5,  code: 'FR06', name: '市民廣場',     distM: 18500, km: 18.4, exp: false, scale: 4, landUse: { E: 0.8, F: 0.2 }, landLabel: '80%E+20%F', transfers: ['地鐵環狀線 (T1)'], note: '' },
    { idx: 6,  code: 'FR07', name: '文化中心',     distM: 19800, km: 19.7, exp: false, scale: 4, landUse: { E: 0.8, F: 0.2 }, landLabel: '80%E+20%F', transfers: ['地鐵環狀線 (T1)'], note: '' },
    { idx: 7,  code: 'FR08', name: '飛灣新站',     distM: 21700, km: 21.6, exp: true,  scale: 5, landUse: { E: 1.0 }, landLabel: 'E', transfers: ['地鐵南北線 (T1)', '地鐵環狀線 (T1)'], note: '' },
    { idx: 8,  code: 'FR09', name: '科創園',       distM: 24000, km: 23.9, exp: false, scale: 4, landUse: { B: 0.85, C: 0.05, F: 0.1 }, landLabel: '85%B+5%C+10%F', transfers: [], note: '' },
    { idx: 9,  code: 'FR10', name: '飛灣學區',     distM: 25200, km: 25.1, exp: false, scale: 4, landUse: { A: 0.4, D: 0.6 }, landLabel: '40%A+60%D', transfers: [], note: '' },
    { idx: 10, code: 'FR11', name: '飛灣大道',     distM: 26900, km: 26.8, exp: false, scale: 4, landUse: { A: 0.5, E: 0.5 }, landLabel: '50%A+50%E', transfers: [], note: '' },
    { idx: 11, code: 'FR12', name: '飛灣公園',     distM: 28500, km: 28.4, exp: true,  scale: 5, landUse: { A: 0.1, F: 0.9 }, landLabel: '10%A+90%F', transfers: ['地鐵公園線 (T1)'], note: '巨蛋賽事轉運樞紐' },
    { idx: 12, code: 'FR13', name: '錦湖',         distM: 29900, km: 29.8, exp: false, scale: 3, landUse: { A: 1.0 }, landLabel: 'A', transfers: [], note: '' },
    { idx: 13, code: 'FR14', name: '鷺島',         distM: 30400, km: 30.3, exp: false, scale: 3, landUse: { A: 1.0 }, landLabel: 'A', transfers: [], note: '' },
    { idx: 14, code: 'FR15', name: '空港新城',     distM: 33200, km: 33.1, exp: false, scale: 2, landUse: { C: 1.0 }, landLabel: 'C', transfers: [], note: '' },
    { idx: 15, code: 'FR16', name: '飛灣機場',     distM: 38100, km: 38.0, exp: true,  scale: 5, landUse: { G: 1.0 }, landLabel: 'G', transfers: [], note: '24小時全天候基礎客流，連假紅眼時段活躍' },
    { idx: 16, code: 'FR17', name: '翡翠花園',     distM: 43300, km: 43.2, exp: false, scale: 2, landUse: { A: 1.0 }, landLabel: 'A', transfers: [], note: '' },
    { idx: 17, code: 'FR18', name: '紫荊苑',       distM: 46500, km: 46.4, exp: false, scale: 4, landUse: { A: 0.9, E: 0.1 }, landLabel: '90%A+10%E', transfers: ['地鐵中央線 (T1)'], note: '地鐵中央線平行分流 (FR18↔FR12/FR08/FR04)' },
    { idx: 18, code: 'FR19', name: '御景新村',     distM: 54700, km: 54.8, exp: false, scale: 1, landUse: { A: 1.0 }, landLabel: 'A', transfers: [], note: '' },
    { idx: 19, code: 'FR20', name: '自然保育中心', distM: 56100, km: 56.2, exp: false, scale: 1, landUse: { H: 0.7, F: 0.3 }, landLabel: '70%H+30%F', transfers: [], note: '' },
    { idx: 20, code: 'FR21', name: '綾路北站',     distM: 57900, km: 58.0, exp: true,  scale: 5, landUse: { A: 0.7, E: 0.3 }, landLabel: '70%A+30%E', transfers: ['ART綾京線 (T2)', '觀光紅楓線 (T3)'], note: '早尖峰ART帶人來、晚尖峰ART接人走' },
    { idx: 21, code: 'FR22', name: '全京大道',     distM: 59100, km: 59.2, exp: false, scale: 3, landUse: { A: 0.8, E: 0.2 }, landLabel: '80%A+20%E', transfers: ['ART綾京線 (T2)'], note: '早尖峰ART帶人來、晚尖峰ART接人走' }
  ];

  const STATION_BY_NAME = {};
  const STATION_BY_CODE = {};
  STATION_PROFILES.forEach(s => {
    STATION_BY_NAME[s.name] = s;
    STATION_BY_CODE[s.code] = s;
  });

  const RAPID_STATIONS = ['飛灣工業區', '飛灣郵輪港', '飛灣新站', '飛灣公園', '飛灣機場', '綾路北站'];
  const RAPID_INDICES = new Set(RAPID_STATIONS.map(n => STATION_BY_NAME[n].idx));

  // 站點規模對應基礎每日旅次權重 (校正後全日總旅次約 32~42 萬人次)
  const SCALE_WEIGHT = { 1: 0.20, 2: 0.42, 3: 0.75, 4: 1.25, 5: 2.05 };

  // =========================================================
  // 3. 全日 24 小時 8 時段進/出站係數矩陣 (K_O / K_D)
  // =========================================================
  const TIME_SLOTS = [
    { id: 'T1', label: 'T1 清晨',      range: '05:30–07:00', startMin: 330,  endMin: 420 },
    { id: 'T2', label: 'T2 早尖峰',    range: '07:00–09:00', startMin: 420,  endMin: 540 },
    { id: 'T3', label: 'T3 上午平峰',  range: '09:00–11:30', startMin: 540,  endMin: 690 },
    { id: 'T4', label: 'T4 午間',      range: '11:30–13:30', startMin: 690,  endMin: 810 },
    { id: 'T5', label: 'T5 下午平峰',  range: '13:30–16:30', startMin: 810,  endMin: 990 },
    { id: 'T6', label: 'T6 晚尖峰',    range: '16:30–19:30', startMin: 990,  endMin: 1170 },
    { id: 'T7', label: 'T7 夜間',      range: '19:30–23:30', startMin: 1170, endMin: 1410 },
    { id: 'T8', label: 'T8 深夜／凌晨', range: '23:30–05:30', startMin: 1410, endMin: 330 }
  ];

  const LAND_USE_COEFFS = {
    T1: { A: [0.8, 0.1],  B: [0.1, 0.5],  C: [0.2, 1.2],  D: [0.1, 0.5],  E: [0.05, 0.15], F: [0.05, 0.15], G: [0.7, 1.1],  H: [0.1, 0.2] },
    T2: { A: [2.5, 0.2],  B: [0.2, 3.3],  C: [0.2, 2.4],  D: [0.2, 2.5],  E: [0.1, 0.85],  F: [0.15, 0.45], G: [1.1, 1.3],  H: [0.1, 0.3] },
    T3: { A: [0.7, 0.4],  B: [0.5, 1.0],  C: [0.3, 0.5],  D: [0.3, 0.6],  E: [0.4, 1.4],   F: [0.35, 1.15], G: [1.0, 1.0],  H: [0.1, 0.1] },
    T4: { A: [0.5, 0.5],  B: [0.8, 0.9],  C: [0.4, 0.4],  D: [0.5, 0.5],  E: [1.3, 1.7],   F: [0.65, 0.95], G: [1.0, 1.0],  H: [0.1, 0.1] },
    T5: { A: [0.5, 0.8],  B: [0.7, 0.6],  C: [0.5, 0.3],  D: [1.6, 0.3],  E: [1.1, 1.8],   F: [1.05, 0.85], G: [1.1, 1.0],  H: [0.1, 0.1] }, // 午後逛街進場提升至 1.8
    T6: { A: [0.3, 2.5],  B: [3.1, 0.35], C: [2.4, 0.2],  D: [1.8, 0.2],  E: [1.75, 2.3],  F: [1.25, 0.75], G: [1.3, 1.2],  H: [0.3, 0.1] }, // E 散場 ko 提早到 T6 (1.75)，同時保持高進場 kd (2.3)
    T7: { A: [0.25, 1.4], B: [0.8, 0.15], C: [0.4, 0.15], D: [0.6, 0.1],  E: [1.35, 0.65], F: [0.65, 0.25], G: [0.9, 0.7],  H: [0.15, 0.1] }, // T7 整體降回 1.35，避免深夜過高
    T8: { A: [0.15, 0.3], B: [0.05, 0.05],C: [0.15, 0.15],D: [0.05, 0.05],E: [0.35, 0.15], F: [0.05, 0.05], G: [0.55, 0.6], H: [0.1, 0.1] }
  };

  function getTimeSlotId(minuteOfDay) {
    const m = ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;
    if (m >= 330 && m < 420) return 'T1';
    if (m >= 420 && m < 540) return 'T2';
    if (m >= 540 && m < 690) return 'T3';
    if (m >= 690 && m < 810) return 'T4';
    if (m >= 810 && m < 990) return 'T5';
    if (m >= 990 && m < 1170) return 'T6';
    if (m >= 1170 && m < 1410) return 'T7';
    return 'T8';
  }

  // 取得指定分鐘與日期型態下，某類土地利用 (A~H) 的 (K_O, K_D)
  function getTypeMultiplierAtMinute(luType, minuteOfDay, dayType) {
    const normMin = ((minuteOfDay % 1440) + 1440) % 1440;
    // C 工業/科技園區早晚尖峰提早約 45 分鐘 (06:30-08:15 入場、16:30-18:30 離場)
    const effMin = (luType === 'C') ? ((normMin + 45) % 1440) : normMin;
    const slotId = getTimeSlotId(effMin);
    let [ko, kd] = LAND_USE_COEFFS[slotId][luType] || [0.5, 0.5];

    // 細部微調：D 學區 15:30-17:30 放學潮
    if (luType === 'D' && effMin >= 930 && effMin <= 1050) {
      ko *= 1.15;
    }

    // 細部微調：E 商圈 18:30-21:00 晚餐/逛街散場主高峰，21:00 後自然降溫
    if (luType === 'E') {
      if (normMin >= 1110 && normMin < 1260) {
        ko *= 1.30; // 18:30-21:00 散場主力時段 (T6末段~T7前段)
      } else if (normMin >= 1260 && normMin < 1410) {
        ko *= 0.65; // 21:00-23:30 商業打烊後人流遞減
      }
    }

    // 星期與連假調整倍率 (依規劃書 三.3)
    const m = ((minuteOfDay % 1440) + 1440) % 1440;
    const after16 = m >= 960;  // 16:00+
    const after15 = m >= 900;  // 15:00+
    const after14 = m >= 840;  // 14:00+
    const earlyMorning = m < 330; // 00:00-05:30

    if (dayType === 'friday') {
      if (after16) {
        if (luType === 'E') kd *= 1.35;
        if (luType === 'G') kd *= 1.45;
        if (luType === 'A') {
          if (slotId === 'T6') kd *= 0.85;
          if (slotId === 'T7') kd *= 1.30;
        }
      }
    } else if (dayType === 'holiday' || dayType === 'sunday') {
      if (luType === 'B' || luType === 'C' || luType === 'D') { ko *= 0.2; kd *= 0.2; }
      if (luType === 'E' || luType === 'F') { ko *= 1.6; kd *= 1.6; }
      if (luType === 'A') {
        if (slotId === 'T2' || slotId === 'T6') { ko *= 0.55; kd *= 0.55; }
        else if (slotId === 'T3' || slotId === 'T4' || slotId === 'T5') { ko *= 1.15; kd *= 1.15; }
      }
      if (dayType === 'sunday' && after16) {
        if (luType === 'G' || luType === 'F') ko *= 1.5;
        if (luType === 'A') kd *= 1.3;
      }
    } else if (dayType === 'weekday_to_long') {
      if (after15 || earlyMorning) {
        if (luType === 'A' || luType === 'B') ko *= 1.35;
        if (luType === 'G') kd *= 2.0;
      }
    } else if (dayType === 'holiday_long') {
      // 基底同週六 + E/F/G 全日額外 x1.35 + T8 深夜 G 與 A 雙向活躍
      if (luType === 'B' || luType === 'C' || luType === 'D') { ko *= 0.2; kd *= 0.2; }
      if (luType === 'E' || luType === 'F') { ko *= 1.6 * 1.35; kd *= 1.6 * 1.35; }
      if (luType === 'G') { ko *= 1.35; kd *= 1.35; }
      if (luType === 'A') {
        if (slotId === 'T2' || slotId === 'T6') { ko *= 0.65; kd *= 0.65; }
        if (slotId === 'T8') { ko *= 1.85; kd *= 1.85; }
      }
      if (slotId === 'T8' && luType === 'G') { ko *= 1.45; kd *= 1.45; }
    } else if (dayType === 'long_to_weekday') {
      if (after14 || m < 180) {
        if (luType === 'G' || luType === 'F') ko *= 2.0;
        if (luType === 'A') kd *= 1.5;
      }
    }
    return [ko, kd];
  }

  const TRANSFER_TIER_COEFFS = {
    // T1: 都會區高運量地鐵線 (平日早晚通勤強)
    T1: {
      T1: [0.22, 0.12],
      T2: [0.38, 0.25],
      T3: [0.15, 0.15],
      T4: [0.15, 0.15],
      T5: [0.18, 0.18],
      T6: [0.25, 0.38],
      T7: [0.15, 0.22],
      T8: [0.05, 0.05]
    },
    // WRT: 城際幹線 (全天候跨城商務/旅運 + 週末連假波峰)
    WRT: {
      T1: [0.18, 0.15], // 清晨首班城際接駁
      T2: [0.32, 0.28], // 跨縣市早尖峰通勤雙向轉乘
      T3: [0.26, 0.26], // 上午城際商務與旅遊穩定客流
      T4: [0.24, 0.24], // 午間轉乘
      T5: [0.28, 0.28], // 下午城際轉乘
      T6: [0.28, 0.35], // 晚尖峰返程轉乘 WRT 離城
      T7: [0.22, 0.25], // 夜間末班城際接駁
      T8: [0.08, 0.08]  // 深夜夜車/紅眼接駁
    },
    // T2: ART 綾京線 (全京市 MOD 城市接駁，維持克制)
    T2: {
      T1: [0.10, 0.05],
      T2: [0.28, 0.08],
      T3: [0.10, 0.10],
      T4: [0.10, 0.10],
      T5: [0.10, 0.12],
      T6: [0.08, 0.28],
      T7: [0.05, 0.15],
      T8: [0.02, 0.02]
    },
    // T3: 觀光紅楓線 (假日與日間觀光轉乘為主)
    T3: {
      T1: [0.02, 0.02],
      T2: [0.05, 0.12],
      T3: [0.10, 0.22],
      T4: [0.12, 0.15],
      T5: [0.20, 0.10],
      T6: [0.18, 0.08],
      T7: [0.05, 0.05],
      T8: [0.00, 0.00]
    }
  };

  function getStationKOKD(station, minuteOfDay, dayType, flywanFestival) {
    let ko = 0, kd = 0;
    const m = ((minuteOfDay % 1440) + 1440) % 1440;
    for (const [lu, w] of Object.entries(station.landUse)) {
      const [tKo, tKd] = getTypeMultiplierAtMinute(lu, minuteOfDay, dayType);
      ko += w * tKo;
      kd += w * tKd;
    }

    const slotId = getTimeSlotId(m);

    // ART 綾京線 (FR21, FR22): 全京市為 MOD 城市且部分改搭渡輪，維持適度轉乘倍率
    if (station.code === 'FR21' || station.code === 'FR22') {
      if (slotId === 'T2') ko *= 1.28;
      if (slotId === 'T6') kd *= 1.28;
    }

    // WRT 環島線與渡輪碼頭 (FR04 飛灣郵輪港): 連假長途潮 + 平日渡輪通勤微幅轉乘
    if (station.code === 'FR04') {
      if (dayType === 'weekday' || dayType === 'friday') {
        if (slotId === 'T2') ko *= 1.15; // 全京市搭渡輪進城轉乘鐵路
        if (slotId === 'T6') kd *= 1.15; // 下班轉乘渡輪回全京市
      }
      if (dayType === 'friday' || dayType === 'weekday_to_long') kd *= 1.25;
      if (dayType === 'sunday' || dayType === 'long_to_weekday') ko *= 1.30;
      if (dayType === 'long_to_weekday' && (m >= 840 || m < 180)) ko *= 1.25;
    }

    // 連假最後一日市區轉乘站 (FR08, FR12, FR21) K_D x1.5
    if (dayType === 'long_to_weekday' && (m >= 840 || m < 180)) {
      if (station.code === 'FR08' || station.code === 'FR12' || station.code === 'FR21') {
        kd *= 1.5;
      }
    }

    // 飛灣公園 (FR12): 全市最大公園 + 地鐵公園線轉乘 + 巨蛋賽事進散場
    if (station.code === 'FR12') {
      // 1) 假日公園休憩與觀光客加成 (疊加在 holiday 1.6 倍之上)
      if (dayType === 'holiday' || dayType === 'sunday' || dayType === 'holiday_long') {
        if (m >= 540 && m < 1080) kd *= 1.25; // 09:00-18:00 假日入園高峰
        if (m >= 960 && m < 1260) ko *= 1.25; // 16:00-21:00 假日離園高峰
      }
      // 2) 巨蛋賽事進場 (17:00-19:00) 與散場 (20:30-22:30)
      if (flywanFestival && flywanFestival.isFinalsWeek) {
        if (m >= 960 && m < 1140) kd *= 1.55; // 總決賽進場潮
        if (m >= 1230 && m < 1380) ko *= 1.75; // 總決賽散場潮
      } else {
        // 一般例行賽事常態 (週二～週日，排除週一休館日 dayOfWeekIdx === 1)
        const isMon = flywanFestival && flywanFestival.dayOfWeekIdx === 1;
        if (!isMon) {
          if (m >= 1020 && m < 1140) kd *= 1.25; // 17:00-19:00 例行賽進場
          if (m >= 1230 && m < 1350) ko *= 1.38; // 20:30-22:30 例行賽散場 (取代原本偏弱的 1.15)
        }
      }
    }

    // T1 / WRT / T2 / T3 專門轉乘係數加成
    const isHolidayLike = (dayType === 'holiday' || dayType === 'sunday' || dayType === 'holiday_long');
    let xferKoBonus = 0, xferKdBonus = 0;
    for (const tf of (station.transfers || [])) {
      let tier = null;
      if (tf.includes('WRT') || tf.includes('城際幹線')) tier = 'WRT';
      else if (tf.includes('(T1)')) tier = 'T1';
      else if (tf.includes('(T2)')) tier = 'T2';
      else if (tf.includes('(T3)')) tier = 'T3';

      if (tier && TRANSFER_TIER_COEFFS[tier]) {
        let [tKo, tKd] = TRANSFER_TIER_COEFFS[tier][slotId] || [0, 0];
        if (isHolidayLike) {
          if (tier === 'T1') { tKo *= 0.55; tKd *= 0.55; }
          if (tier === 'WRT') { tKo *= 1.35; tKd *= 1.35; } // 假日城際出遊轉乘更旺
          if (tier === 'T3') { tKo *= 1.80; tKd *= 1.80; }
        }
        // WRT 週五/連假前夕去程、週日/收假日回程額外加成
        if (tier === 'WRT') {
          if (dayType === 'friday' || dayType === 'weekday_to_long') tKd *= 1.30;
          if (dayType === 'sunday' || dayType === 'long_to_weekday') tKo *= 1.35;
        }
        xferKoBonus += tKo;
        xferKdBonus += tKd;
      }
    }
    ko += xferKoBonus;
    kd += xferKdBonus;

    return { ko, kd, slotId };
  }

  // =========================================================
  // 4. 飛灣曆與日期型態推算
  // =========================================================
  function isFlywanLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  function getFlywanFestival(m, d) {
    if (m === 1 && d === 1) return { name: '建國紀念日', scheduleType: 'holiday_long' };
    if (m === 2 && d === 1) return { name: '情人日', scheduleType: 'holiday' };
    if (m === 3 && d === 1) return { name: '宗教日', scheduleType: 'holiday' };
    if (m === 4 && d === 1) return { name: '兒童日', scheduleType: 'holiday' };
    if (m === 5 && d === 1) return { name: '職業紀念日', scheduleType: 'holiday' };
    if (m === 6 && d >= 26 && d <= 30) return { name: '家庭周', scheduleType: 'holiday_long' };
    if (m === 7 && d >= 1 && d <= 5) return { name: '旅遊周', scheduleType: 'holiday_long' };
    if (m === 8 && d === 1) return { name: '親人節', scheduleType: 'holiday' };
    if (m === 9 && d === 1) return { name: '性別平等日', scheduleType: 'holiday' };
    if (m === 10 && d === 1) return { name: '和平日', scheduleType: 'holiday' };
    if (m === 11 && d === 1) return { name: '自然日', scheduleType: 'holiday' };
    if (m === 12 && d === 30) return { name: '年尾紀念日', scheduleType: 'holiday_long' };
    return null;
  }

  function convertDateToFlywanInfo(dateObj) {
    const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const year = d.getFullYear();
    const leap = isFlywanLeapYear(year);
    const holidayDays = leap ? 6 : 5;
    const startOfYear = new Date(year, 0, 1);
    const dayOfYear = Math.round((d - startOfYear) / 86400000) + 1;

    if (dayOfYear <= holidayDays) {
      return {
        year, month: 0, day: dayOfYear, dayOfWeekIdx: 5,
        dayName: '連假', isFinalsWeek: false,
        festival: { name: '年初假期週', scheduleType: 'holiday_long' },
        baseSchedType: 'holiday_long',
        dayType: 'holiday_long',
        label: `飛灣曆 ${year}年 年初假期週 D${dayOfYear}`
      };
    }

    const regDay = dayOfYear - holidayDays;
    const m = Math.floor((regDay - 1) / 30) + 1;
    const dayInMonth = ((regDay - 1) % 30) + 1;
    const wIdx = (dayInMonth - 1) % 5; // 0:週一,1:週二,2:週三,3:週四(小週末),4:休息日
    const wNames = ['週一', '週二', '週三', '週四', '休息日'];
    const fest = getFlywanFestival(m, dayInMonth);
    const isRestDay = (dayInMonth % 5 === 0);
    const baseSchedType = fest ? fest.scheduleType : (isRestDay ? 'holiday' : 'weekday');
    const isFinalsWeek = (dayInMonth >= 26); // 每月第6週巨蛋總決賽

    return {
      year, month: m, day: dayInMonth, dayOfWeekIdx: wIdx + 1,
      dayName: wNames[wIdx], isFinalsWeek, festival: fest, baseSchedType,
      label: `飛灣曆 ${year}年 第${m}月${dayInMonth}日 (${wNames[wIdx]}${fest ? '・' + fest.name : ''})`
    };
  }

  function resolveDayContext(dateObj) {
    const info = convertDateToFlywanInfo(dateObj);
    let schedType = info.baseSchedType;
    let dayType = 'weekday';
    if (schedType !== 'holiday_long') {
      const nextD = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + 1);
      const prevD = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() - 1);
      if (convertDateToFlywanInfo(nextD).baseSchedType === 'holiday_long') {
        schedType = 'weekday_to_long';
        dayType = 'weekday_to_long';
      } else if (convertDateToFlywanInfo(prevD).baseSchedType === 'holiday_long') {
        schedType = 'long_to_weekday';
        dayType = 'long_to_weekday';
      } else if (schedType === 'holiday') {
        dayType = (info.dayOfWeekIdx === 5) ? 'holiday' : 'sunday';
      } else if (info.dayOfWeekIdx === 4) {
        dayType = 'friday'; // 5日週中休息日前一晚 (小週末)
      }
    } else {
      dayType = 'holiday_long';
    }
    return { ...info, schedType, dayType };
  }

  // =========================================================
  // 5. 票價計算模型 (1 飛灣幣 = 10 美元) — 與 tickets.html 完全一致
  // =========================================================
  function calculateFareFWC(kmDist, ticketKind = 'single') {
    const d = Math.max(0, kmDist);
    if (ticketKind === 'business') {
      return parseFloat((0.35 + d * 0.03).toFixed(2));
    }
    return parseFloat((0.12 + d * 0.012).toFixed(2));
  }

  const PASS_FARES_FWC = {
    pass_1: 0.85,
    pass_2: 1.55,
    pass_3: 2.20,
    pass_5: 3.40,
    pass_7: 4.50,
    pass_30: 10.80,
    luggage_check: 0.12,
    bicycle: 0.20,
    large_luggage: 0.08,
    holiday_pkg: 0.50
  };

  // =========================================================
  // 6. 輕量 OuDia CSV 解析器 (供統計頁面與獨立模擬使用)
  // =========================================================
  function parseTimeStrToSecs(str) {
    if (!str) return null;
    const raw = String(str).trim().replace(/[^\d]/g, '');
    if (!raw || raw.length < 3) return null;
    const s = raw.padStart(6, '0');
    const hh = parseInt(s.slice(0, 2), 10);
    const mm = parseInt(s.slice(2, 4), 10);
    const ss = parseInt(s.slice(4, 6), 10);
    if (isNaN(hh) || isNaN(mm) || isNaN(ss)) return null;
    return hh * 3600 + mm * 60 + ss;
  }

  function normalizeTimetableSecs(s) {
    let x = s;
    while (x < 4 * 3600) x += 86400;
    return x;
  }

  function parseCSVRows(csvText) {
    if (!csvText) return [];
    const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/);
    return lines.map(line => line.split(','));
  }

  function buildTrainsFromEmbeddedCSVs(schedType) {
    const csvMap = global.EMBEDDED_TIMETABLE_CSVS;
    if (!csvMap) return { down: [], up: [] };

    function parseDir(key, dir) {
      const csvText = csvMap[key];
      if (!csvText) return [];
      const rows = parseCSVRows(csvText);
      let numRow = -1, typeRow = -1, firstStationRow = -1;
      for (let r = 0; r < Math.min(25, rows.length); r++) {
        if (rows[r][0] === '列車番号') numRow = r;
        if (rows[r][0] === '列車種別') typeRow = r;
        if (rows[r][0] && STATION_BY_NAME[rows[r][0].trim()] && firstStationRow === -1) {
          firstStationRow = r;
        }
      }
      if (numRow === -1 || typeRow === -1 || firstStationRow === -1) return [];

      // 彙整各站 arr / dep 列索引
      const stRows = {};
      for (let r = firstStationRow; r < rows.length; r++) {
        const stName = (rows[r][0] || '').trim();
        const kind = (rows[r][1] || '').trim();
        if (!STATION_BY_NAME[stName]) continue;
        if (!stRows[stName]) stRows[stName] = {};
        if (kind === '着') stRows[stName].arr = r;
        if (kind === '発') stRows[stName].dep = r;
      }

      const numCols = rows[numRow].length;
      const trains = [];
      for (let c = 2; c < numCols; c++) {
        const num = (rows[numRow][c] || '').trim();
        const type = (rows[typeRow][c] || '').trim();
        if (!num || !type || type.includes('回送') || type.includes('迴送')) continue;

        const orderedStations = (dir === 'down')
          ? STATION_PROFILES
          : [...STATION_PROFILES].reverse();

        const stopNodes = [];
        let prevT = 0;
        for (const st of orderedStations) {
          const sr = stRows[st.name];
          if (!sr) continue;
          const rawArr = (sr.arr !== undefined) ? (rows[sr.arr][c] || '').trim() : '';
          const rawDep = (sr.dep !== undefined) ? (rows[sr.dep][c] || '').trim() : '';

          const arrIsStop = /^\d+$/.test(rawArr);
          const depIsStop = /^\d+$/.test(rawDep);
          if (!arrIsStop && !depIsStop) continue;

          let arrSecs = arrIsStop ? normalizeTimetableSecs(parseTimeStrToSecs(rawArr)) : null;
          let depSecs = depIsStop ? normalizeTimetableSecs(parseTimeStrToSecs(rawDep)) : null;
          const dwell = RAPID_INDICES.has(st.idx) || st.idx === 21 ? 60 : 30;
          if (depSecs !== null && arrSecs === null) arrSecs = depSecs - dwell;
          if (arrSecs !== null && depSecs === null) depSecs = arrSecs + dwell;

          while (arrSecs < prevT) arrSecs += 86400;
          prevT = arrSecs;
          while (depSecs < prevT) depSecs += 86400;
          prevT = depSecs;

          stopNodes.push({
            stationIdx: st.idx,
            cleanName: st.name,
            arrSecs,
            depSecs,
            isStop: true
          });
        }

        if (stopNodes.length < 2) continue;
        // 終點站停靠 60 秒
        const last = stopNodes[stopNodes.length - 1];
        last.depSecs = Math.max(last.depSecs, last.arrSecs + 60);

        const is6Cars = !(type.includes('特快') || type.includes('特別快速') || type.includes('通勤')) &&
                        (type.includes('快速') || type.includes('特急') || type.includes('直通'));
        trains.push({
          num,
          type,
          dir,
          isDeadhead: false,
          is6Cars,
          stopNodes
        });
      }
      return trains;
    }

    return {
      down: parseDir(`${schedType}_down`, 'down'),
      up: parseDir(`${schedType}_up`, 'up')
    };
  }

  // 從 live.html 的 timelines 轉成統一格式
  function normalizeLiveTimelines(downTimelines, upTimelines) {
    function mapList(list, dir) {
      const out = [];
      for (const tl of (list || [])) {
        if (!tl || tl.isDeadhead || (tl.type && (tl.type.includes('回送') || tl.type.includes('迴送')))) continue;
        const stopNodes = [];
        for (const nd of (tl.stopNodes || [])) {
          const stObj = STATION_BY_NAME[nd.cleanName];
          if (!stObj) continue;
          const arrSecs = (nd.arrSecs !== null && nd.arrSecs !== undefined) ? nd.arrSecs : (nd.depSecs - 30);
          const depSecs = (nd.depSecs !== null && nd.depSecs !== undefined) ? nd.depSecs : (nd.arrSecs + 30);
          stopNodes.push({
            stationIdx: stObj.idx,
            cleanName: stObj.name,
            arrSecs,
            depSecs,
            isStop: true
          });
        }
        if (stopNodes.length < 2) continue;
        const is6Cars = (tl.gameType === 'express' || tl.length === 130);
        out.push({
          num: String(tl.num),
          type: tl.type || '普通',
          dir: tl.dir || dir,
          isDeadhead: false,
          is6Cars,
          stopNodes
        });
      }
      return out;
    }
    return {
      down: mapList(downTimelines, 'down'),
      up: mapList(upTimelines, 'up')
    };
  }

  // =========================================================
  // 7. 列車編組容量 & 5 級擁擠度定義 (規劃書 一)
  // =========================================================
  function getTrainCapacitySpec(is6Cars) {
    if (is6Cars) {
      return {
        formationLabel: '135M (6節快速編組)',
        baseCapOrd: 750,
        physCapOrd: 1313, // 175%
        baseCapBiz: 48,
        physCapBiz: 48    // 100% 對號入座不站立
      };
    }
    return {
      formationLabel: '85M (4節一般編組)',
      baseCapOrd: 600,
      physCapOrd: 1050, // 175%
      baseCapBiz: 0,
      physCapBiz: 0
    };
  }

  function getCrowdLevelFromPct(pct) {
    if (pct < 25) return 1;
    if (pct < 55) return 2;
    if (pct < 85) return 3;
    if (pct <= 110) return 4;
    return 5;
  }

  // =========================================================
  // 8. 營運日全線客流模擬核心 (月台蓄水池 + 階段A規劃 + 階段B不挑車)
  // =========================================================
  const _daySimCache = new Map();

  // 年度營運里程碑與歷史規模係數 (依據 company.html 公司沿革)
  function getYearHistoryFactor(year) {
    if (year <= 2020) {
      return {
        activeMonths: 2.5, // 2020年底試運轉/籌備測試期
        demandScale: 0.14,
        label: '2020 創設暨試運轉籌備期',
        note: '2020/01/01 公司成立，全年投入機場線土建與機電採購，年底展開部分路段試運轉。'
      };
    }
    if (year === 2021) {
      return {
        activeMonths: 10.0, // 2021/03/01 延伸至飛灣機場通車
        demandScale: 0.48,
        label: '2021 飛灣機場通車首年 (3月起營運)',
        note: '2021/03/01 飛灣機場開幕並通車至飛灣機場，初期培養通勤與機場聯運客源。'
      };
    }
    if (year === 2022) {
      return {
        activeMonths: 12.0, // 4月海莊、10月夏城完工
        demandScale: 0.72,
        label: '2022 全線分段通車完工年',
        note: '2022/04/01 通車至海莊、2022/10/03 飛灣線全線完工，運量逐季爬升。'
      };
    }
    if (year === 2023) {
      return {
        activeMonths: 12.0,
        demandScale: 0.86,
        label: '2023 全線完整營運首年',
        note: '全線貫通後首個完整會計年度，通勤與觀光旅次穩定成長，營運邁入損益兩平。'
      };
    }
    if (year === 2024) {
      return {
        activeMonths: 12.0,
        demandScale: 0.96,
        label: '2024 飛灣環狀線通車聯網年',
        note: '2024/01/01 飛灣環狀線通車完成主要生活圈連結，轉乘路網效應帶動運量大增。'
      };
    }
    if (year === 2025) {
      return {
        activeMonths: 12.0,
        demandScale: 1.02,
        label: '2025 都會核心擴張與綠色轉型年',
        note: '配合《海岸景觀復育法》與《綠色縫合計畫》展開沿線轉型與運量優化，載客量創階段新高。'
      };
    }
    // 2026+
    const extraGrowth = 1.0 + Math.max(0, year - 2026) * 0.025;
    return {
      activeMonths: 12.0,
      demandScale: 1.00 * extraGrowth,
      label: `${year} 飛灣新都會區暨聯賽常態營運期`,
      note: '2026/01 配合《飛灣新都會區計畫》與《全京綠色計畫》調整站名與路網，並結合巨蛋聯賽疏運，進入成熟獲利期。'
    };
  }

  function simulateDayOperations(options = {}) {
    const schedType = options.schedType || 'weekday';
    const dayType = options.dayType || (
      schedType === 'holiday_long' ? 'holiday_long' :
      schedType === 'holiday' ? 'holiday' :
      schedType === 'weekday_to_long' ? 'weekday_to_long' :
      schedType === 'long_to_weekday' ? 'long_to_weekday' : 'weekday'
    );
    const year = options.year || 2026;
    const seedKey = options.seedKey || `${year}-${schedType}-${dayType}`;
    const isFinalsWeek = !!options.isFinalsWeek;
    const collectSamples = options.collectSamples !== false;

    const cacheKey = `${seedKey}|${isFinalsWeek ? 1 : 0}|${options.timelines ? 'live' : 'emb'}|${collectSamples ? 1 : 0}`;
    if (_daySimCache.has(cacheKey)) return _daySimCache.get(cacheKey);

    const rng = createRNG(`flywan-sim-${seedKey}`);
    const yearFactor = getYearHistoryFactor(year);

    // 1. 取得方向列車清單
    const rawTrains = options.timelines
      ? normalizeLiveTimelines(options.timelines.down, options.timelines.up)
      : buildTrainsFromEmbeddedCSVs(schedType);

    const allTrains = [...rawTrains.down, ...rawTrains.up];
    allTrains.forEach((tr, idx) => {
      tr._uid = `${tr.dir}-${tr.num}`;
      tr._idx = idx;
      tr._spec = getTrainCapacitySpec(tr.is6Cars);
      tr._onBoardOrd = new Float64Array(22); // 依最終目的地記錄車上普通艙人數
      tr._onBoardBiz = new Float64Array(22); // 依最終目的地記錄車上商務艙人數
      tr._xferOrd = new Float64Array(22);    // 依中途轉乘站記錄普通艙轉乘人數 (不計出站)
      tr._xferBiz = new Float64Array(22);    // 依中途轉乘站記錄商務艙轉乘人數 (不計出站)
      tr._totalOrd = 0;
      tr._totalBiz = 0;
      tr._stopsMap = new Map();
      tr._stopSnapshots = [];
      tr.stopNodes.forEach((sn, si) => {
        tr._stopsMap.set(sn.stationIdx, si);
      });
    });

    // 建立各站停靠發車索引：stationDepartures[stationIdx][dir] = [{ tr, stopIdx, arrSecs, depSecs, maxReachIdx }]
    const stationDepartures = Array.from({ length: 22 }, () => ({ down: [], up: [] }));
    const stopEventsByMinute = new Map(); // minute (240..1720) -> list of { tr, stopIdx }

    allTrains.forEach(tr => {
      const stops = tr.stopNodes;
      stops.forEach((sn, si) => {
        if (si < stops.length - 1) {
          stationDepartures[sn.stationIdx][tr.dir].push({
            tr,
            stopIdx: si,
            arrSecs: sn.arrSecs,
            depSecs: sn.depSecs
          });
        }
        const depMin = Math.floor(sn.depSecs / 60);
        if (!stopEventsByMinute.has(depMin)) stopEventsByMinute.set(depMin, []);
        stopEventsByMinute.get(depMin).push({ tr, stopIdx: si });
      });
    });

    for (let s = 0; s < 22; s++) {
      stationDepartures[s].down.sort((a, b) => a.depSecs - b.depSecs);
      stationDepartures[s].up.sort((a, b) => a.depSecs - b.depSecs);
    }

    // 2. 預計算時刻表實際旅行時間 (含 2 分鐘轉乘懲罰) 與地鐵中央線平行分流係數
    function calcTimetableTravelMins(o, d) {
      const dir = (d > o) ? 'down' : 'up';
      const deps = stationDepartures[o][dir];
      if (!deps || deps.length === 0) return Math.abs(STATION_PROFILES[d].km - STATION_PROFILES[o].km) * 1.4;
      const sampleSec = 8 * 3600; // 以早尖峰 08:00 時刻表為基準
      let lo = 0, hi = deps.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (deps[mid].depSecs < sampleSec) lo = mid + 1;
        else hi = mid;
      }
      let bestMins = Infinity;
      const startIdx = Math.max(0, Math.min(deps.length - 1, lo));
      const endIdx = Math.min(deps.length, startIdx + 5);
      for (let i = startIdx; i < endIdx; i++) {
        const cand = deps[i];
        const tr = cand.tr;
        if (tr._stopsMap.has(d)) {
          const mins = (tr.stopNodes[tr._stopsMap.get(d)].arrSecs - cand.depSecs) / 60;
          if (mins > 0 && mins < bestMins) bestMins = mins;
          continue;
        }
        const si0 = cand.stopIdx;
        for (let si = si0 + 1; si < tr.stopNodes.length; si++) {
          const xNode = tr.stopNodes[si];
          const x = xNode.stationIdx;
          if ((dir === 'down' && x >= d) || (dir === 'up' && x <= d)) break;
          if (!RAPID_INDICES.has(x)) continue;
          const readyAtX = xNode.arrSecs + 45; // 含轉乘時間 45 秒
          const xDeps = stationDepartures[x][dir];
          let xLo = 0, xHi = xDeps.length;
          while (xLo < xHi) {
            const xMid = (xLo + xHi) >> 1;
            if (xDeps[xMid].depSecs < readyAtX) xLo = xMid + 1;
            else xHi = xMid;
          }
          for (let j = xLo; j < Math.min(xDeps.length, xLo + 3); j++) {
            const tr2 = xDeps[j].tr;
            if (tr2._stopsMap.has(d)) {
              const mins = (tr2.stopNodes[tr2._stopsMap.get(d)].arrSecs - cand.depSecs) / 60;
              if (mins > 0 && mins < bestMins) bestMins = mins;
              break;
            }
          }
        }
      }
      if (!isFinite(bestMins)) {
        return Math.abs(STATION_PROFILES[d].km - STATION_PROFILES[o].km) * 1.4;
      }
      return bestMins;
    }

    const metroDiversionFactor = Array.from({ length: 22 }, () => new Float64Array(22).fill(1.0));
    const centralTargets = [3, 7, 11]; // FR04, FR08, FR12
    for (const tIdx of centralTargets) {
      const divRate1 = randNormal(rng, 0.40, 0.022, 0.35, 0.45);
      const divRate2 = randNormal(rng, 0.40, 0.022, 0.35, 0.45);
      metroDiversionFactor[17][tIdx] = 1.0 - divRate1;
      metroDiversionFactor[tIdx][17] = 1.0 - divRate2;
    }

    const odGravity = Array.from({ length: 22 }, () => new Float64Array(22));
    for (let o = 0; o < 22; o++) {
      for (let d = 0; d < 22; d++) {
        if (o === d) continue;
        const distKm = Math.abs(STATION_PROFILES[d].km - STATION_PROFILES[o].km);
        const travelMins = calcTimetableTravelMins(o, d);
        // TOD 時刻表時間區隔：<=45分（核心生活圈）、45~60分（次級通勤圈）、>60分（長途衰減）
        let timeDecay;
        if (travelMins <= 45) {
          timeDecay = 1.0 - 0.22 * (travelMins / 45.0);
        } else if (travelMins <= 60) {
          timeDecay = 0.78 - 0.33 * ((travelMins - 45.0) / 15.0);
        } else {
          timeDecay = Math.max(0.06, 0.45 * Math.exp(-(travelMins - 60.0) / 25.0));
        }
        if (distKm < 1.5) timeDecay *= 0.60;

        const hubBonus = (STATION_PROFILES[o].scale === 5 || STATION_PROFILES[d].scale === 5) ? 1.38 : 1.0;
        const rawW = SCALE_WEIGHT[STATION_PROFILES[o].scale] * SCALE_WEIGHT[STATION_PROFILES[d].scale] * timeDecay * hubBonus * metroDiversionFactor[o][d];
        odGravity[o][d] = rawW * randNormal(rng, 1.0, 0.06, 0.82, 1.20);
      }
    }

    // 預先計算各站全日總 K_O / K_D 及地理位置吸納修正，使進站與出站維持合理的往返守恆
    const dailyKOBalance = new Float64Array(22).fill(1.0);
    const destGeoBalance = new Float64Array(22).fill(1.0);
    {
      const sumKO = new Float64Array(22);
      const sumKD = new Float64Array(22);
      for (let tm = 330; tm < 1410; tm += 15) {
        for (let s = 0; s < 22; s++) {
          const k = getStationKOKD(STATION_PROFILES[s], tm, dayType, { isFinalsWeek });
          sumKO[s] += k.ko;
          sumKD[s] += k.kd;
        }
      }
      for (let s = 0; s < 22; s++) {
        const target = Math.max(0.4, (sumKO[s] + sumKD[s]) * 0.5);
        dailyKOBalance[s] = sumKO[s] > 0.01 ? Math.min(2.2, Math.max(0.55, target / sumKO[s])) : 1.0;
      }
      // 計算各站作為目的地的幾何重力總和，使端點站與中央站依規模權重合理分攤出站
      const colSum = new Float64Array(22);
      for (let o = 0; o < 22; o++) {
        for (let d = 0; d < 22; d++) colSum[d] += odGravity[o][d];
      }
      let avgRatio = 0;
      for (let d = 0; d < 22; d++) avgRatio += colSum[d] / SCALE_WEIGHT[STATION_PROFILES[d].scale];
      avgRatio /= 22;
      for (let d = 0; d < 22; d++) {
        const expected = SCALE_WEIGHT[STATION_PROFILES[d].scale] * avgRatio;
        destGeoBalance[d] = colSum[d] > 0 ? Math.min(1.6, Math.max(0.55, expected / colSum[d])) : 1.0;
        for (let o = 0; o < 22; o++) {
          odGravity[o][d] *= destGeoBalance[d];
        }
      }
    }

    // 階段 A 查詢函式：為在時刻 sec 抵達車站 o 要前往 d 的旅客，計算最佳目標班次 (含2分鐘轉乘懲罰與快取加速)
    const _planCache = new Map();
    function findBestTargetTrain(o, d, sec) {
      const dir = (d > o) ? 'down' : 'up';
      const deps = stationDepartures[o][dir];
      let lo = 0, hi = deps.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (deps[mid].depSecs < sec) lo = mid + 1;
        else hi = mid;
      }

      // 每位旅客依「精確進站秒數」逐一查詢；結果僅取決於第一個趕得上的班次序號 lo，故以 (o, d, lo) 精確快取 (不再以 2 分鐘分桶近似)
      const cKey = ((o * 22 + d) * 4096) + lo;
      const cached = _planCache.get(cKey);
      if (cached) return cached;

      let bestArrival = Infinity;
      let bestTrainUid = null;
      let missedFirst = false;

      if (lo > 0 && (sec - deps[lo - 1].depSecs) <= 25) {
        const prevTr = deps[lo - 1].tr;
        if (prevTr._stopsMap.has(d)) missedFirst = true;
      }

      const maxCheck = Math.min(deps.length, lo + 5);
      for (let i = lo; i < maxCheck; i++) {
        const cand = deps[i];
        const tr = cand.tr;
        if (tr._stopsMap.has(d)) {
          const arrAtD = tr.stopNodes[tr._stopsMap.get(d)].arrSecs;
          if (arrAtD < bestArrival) {
            bestArrival = arrAtD;
            bestTrainUid = tr._uid;
          }
          continue;
        }
        for (let si = cand.stopIdx + 1; si < tr.stopNodes.length; si++) {
          const xNode = tr.stopNodes[si];
          const x = xNode.stationIdx;
          if ((dir === 'down' && x >= d) || (dir === 'up' && x <= d)) break;
          if (!RAPID_INDICES.has(x)) continue;
          const readyAtX = xNode.arrSecs + 45; // 跨車種轉乘懲罰 45 秒
          const xDeps = stationDepartures[x][dir];
          let xLo = 0, xHi = xDeps.length;
          while (xLo < xHi) {
            const xMid = (xLo + xHi) >> 1;
            if (xDeps[xMid].depSecs < readyAtX) xLo = xMid + 1;
            else xHi = xMid;
          }
          for (let j = xLo; j < Math.min(xDeps.length, xLo + 3); j++) {
            const tr2 = xDeps[j].tr;
            if (tr2._stopsMap.has(d)) {
              const arr2 = tr2.stopNodes[tr2._stopsMap.get(d)].arrSecs;
              if (arr2 < bestArrival) {
                bestArrival = arr2;
                bestTrainUid = tr._uid;
              }
              break;
            }
          }
        }
      }

      const res = { bestTrainUid, missedFirst };
      _planCache.set(cKey, res);
      return res;
    }

    // 3. 初始化月台蓄水池與統計結構
    // 每個 (o, d) 池子存有：{ planned, replan1, replan2, urgent(連漏3班以上不挑車), fallback, transferQueue }
    const platformPools = Array.from({ length: 22 }, () =>
      Array.from({ length: 22 }, () => ({
        planned: new Map(),
        replan1: new Map(),
        replan2: new Map(),
        urgent: 0,
        fallback: 0,
        transferQueue: []
      }))
    );

    const stationEntries = new Float64Array(22);
    const stationExits = new Float64Array(22);
    const stationHourlyEntries = Array.from({ length: 22 }, () => new Float64Array(24));
    const stationHourlyExits = Array.from({ length: 22 }, () => new Float64Array(24));
    const stationSlotEntries = Array.from({ length: 22 }, () => ({ T1: 0, T2: 0, T3: 0, T4: 0, T5: 0, T6: 0, T7: 0, T8: 0 }));
    const stationSlotExits = Array.from({ length: 22 }, () => ({ T1: 0, T2: 0, T3: 0, T4: 0, T5: 0, T6: 0, T7: 0, T8: 0 }));
    const stationLeftBehinds = new Float64Array(22);

    const odTrips = Array.from({ length: 22 }, () => new Float64Array(22));
    const odRevenueFWC = Array.from({ length: 22 }, () => new Float64Array(22));
    const odSumRideSecs = Array.from({ length: 22 }, () => new Float64Array(22));
    const odBizTrips = Array.from({ length: 22 }, () => new Float64Array(22));

    let totalBoardings = 0;
    let totalLeftBehinds = 0;
    let totalFallbackBoardings = 0;

    // 旅客錯過列車 (客滿未擠上／班次已關門離站) 後，依「錯過當下時刻」重新查詢時刻表最早可上車的方式；
    // 若累計 3 班車以上沒搭到，改入 urgent 池：只要是最快能到達目的地或能到達目的地最早發車的車都上車
    function replanQty(o, d, qty, sec, prevMissCount = 0) {
      if (qty <= 0) return;
      const pool = platformPools[o][d];
      const nextMiss = prevMissCount + 1;
      if (nextMiss >= 3) {
        pool.urgent += qty;
        return;
      }
      const plan = findBestTargetTrain(o, d, sec);
      if (plan.bestTrainUid) {
        const targetMap = (nextMiss === 1) ? pool.replan1 : pool.replan2;
        targetMap.set(plan.bestTrainUid, (targetMap.get(plan.bestTrainUid) || 0) + qty);
      } else {
        pool.fallback += qty; // 當日已無可搭乘班次
      }
    }
    let totalBizBoardings = 0;
    const crowdDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let stopSnapshotCount = 0;
    const sampleTapRecords = [];
    const minuteWaitingTotals = new Float64Array(1681);

    // 決定服務起訖分鐘 (非連假 05:25~25:05 才有累積，末班車後歸零；連假全天候 24 小時 04:00~28:00 持續補人載客)
    const is24h = (dayType === 'holiday_long');
    const simStartMin = 4 * 60;       // 04:00
    const simEndMin = 28 * 60;        // 04:00 (+1 day)

    // 校正乘數：使 2026 平日總運量落在約 310,000 ~ 350,000 人次/日，尖峰車廂可達 85%~120% 並適度觸發留置
    const GLOBAL_FLOW_CALIBRATION = 2.68 * yearFactor.demandScale;

    // 計算每個車站對每個目的地的基礎權重總和，用來標準化分鐘進站率
    const stationOWeight = new Float64Array(22);
    const stationDWeight = new Float64Array(22);
    for (let o = 0; o < 22; o++) {
      let sum = 0;
      for (let d = 0; d < 22; d++) sum += odGravity[o][d];
      stationOWeight[o] = sum || 1;
    }

    // 4. 分鐘步進模擬 (04:00 -> 28:00)
    const carryOver = Array.from({ length: 22 }, () => new Float64Array(22));
    let sampleBudgetPerHour = 14;

    for (let m = simStartMin; m <= simEndMin; m++) {
      const modMin = m % 1440;
      const hr = Math.floor(modMin / 60);
      const slotId = getTimeSlotId(modMin);
      const secNow = m * 60;

      // 是否處於收班停止進站期間 (非連假 00:45 - 05:20)
      const isNightClosed = !is24h && (modMin >= 45 && modMin < 320);

      if (isNightClosed) {
        // 末班車收班後，候車池於清晨前歸零
        for (let o = 0; o < 22; o++) {
          for (let d = 0; d < 22; d++) {
            platformPools[o][d].planned.clear();
            platformPools[o][d].replan1.clear();
            platformPools[o][d].replan2.clear();
            platformPools[o][d].urgent = 0;
            platformPools[o][d].fallback = 0;
            platformPools[o][d].transferQueue.length = 0;
            carryOver[o][d] = 0;
          }
        }
      } else {
        // 步驟 4A: 依 24 小時 K_O / K_D 係數向月台蓄水池補人
        const stationKO = new Float64Array(22);
        const stationKD = new Float64Array(22);
        for (let s = 0; s < 22; s++) {
          const k = getStationKOKD(STATION_PROFILES[s], modMin, dayType, { isFinalsWeek });
          stationKO[s] = k.ko;
          stationKD[s] = k.kd;
        }

        // 先解除已到達轉乘緩衝時間 (2分鐘) 的轉乘旅客
        for (let o = 0; o < 22; o++) {
          for (let d = 0; d < 22; d++) {
            const pool = platformPools[o][d];
            if (pool.transferQueue.length > 0) {
              const remain = [];
              for (const tq of pool.transferQueue) {
                if (secNow >= tq.readySec) {
                  if (tq.fallback) replanQty(o, d, tq.qty, secNow);
                  else {
                    const plan = findBestTargetTrain(o, d, secNow);
                    if (plan.bestTrainUid) {
                      pool.planned.set(plan.bestTrainUid, (pool.planned.get(plan.bestTrainUid) || 0) + tq.qty);
                    } else {
                      pool.fallback += tq.qty;
                    }
                  }
                } else {
                  remain.push(tq);
                }
              }
              pool.transferQueue = remain;
            }
          }
        }

        // 投入本分鐘新進站旅客
        for (let o = 0; o < 22; o++) {
          // 單分鐘進站強度 = stationKO[o] * 站點往返平衡係數 * 站點規模權重 * 常態波動
          const originFlowBase = stationKO[o] * dailyKOBalance[o] * SCALE_WEIGHT[STATION_PROFILES[o].scale] * GLOBAL_FLOW_CALIBRATION;
          if (originFlowBase <= 0.0001) continue;

          // 計算目的地吸引力分母
          let denom = 0;
          for (let d = 0; d < 22; d++) {
            if (d === o) continue;
            denom += odGravity[o][d] * (0.25 + stationKD[d]);
          }
          if (denom <= 0) continue;

          for (let d = 0; d < 22; d++) {
            if (d === o) continue;
            const share = (odGravity[o][d] * (0.25 + stationKD[d])) / denom;
            // 每分鐘進站期望人數（含常態分布微擾）
            const noise = randNormal(rng, 1.0, 0.14, 0.55, 1.55);
            const rate = originFlowBase * share * noise * 4.85;
            const totalAcc = carryOver[o][d] + rate;
            const arrPax = Math.floor(totalAcc);
            carryOver[o][d] = totalAcc - arrPax;
            if (arrPax <= 0) continue;

            // 階段 A：每位旅客依自己的進站秒數，逐一查詢時刻表最早抵達目的地的班次 (含轉乘)
            const pool = platformPools[o][d];
            const nGroups = Math.min(arrPax, 10);
            const baseQty = Math.floor(arrPax / nGroups);
            const extraQty = arrPax - baseQty * nGroups;
            let enteredQty = 0;
            for (let g = 0; g < nGroups; g++) {
              const qty = baseQty + (g < extraQty ? 1 : 0);
              const arrSec = secNow + Math.floor(rng() * 60);
              const plan = findBestTargetTrain(o, d, arrSec + 15); // +15 秒為閘門至月台步行時間
              if (!plan.bestTrainUid) continue; // 末班車已過
              pool.planned.set(plan.bestTrainUid, (pool.planned.get(plan.bestTrainUid) || 0) + qty);
              enteredQty += qty;
            }
            if (enteredQty <= 0) continue;

            stationEntries[o] += enteredQty;
            stationHourlyEntries[o][hr] += enteredQty;
            stationSlotEntries[o][slotId] += enteredQty;
          }
        }
      }

      // 步驟 4B: 處理本分鐘發車之列車停靠 (先下後上，受物理上限 1080 / 1152+48 限制)
      const events = stopEventsByMinute.get(m);
      if (events && events.length > 0) {
        // 依發車時間排序
        events.sort((a, b) => a.tr.stopNodes[a.stopIdx].depSecs - b.tr.stopNodes[b.stopIdx].depSecs);

        for (const ev of events) {
          const tr = ev.tr;
          const si = ev.stopIdx;
          const sn = tr.stopNodes[si];
          const s = sn.stationIdx;
          const isTerminal = (si === tr.stopNodes.length - 1);

          // 1) 下車 (Alight): 目的地即本站者 + 在轉乘站中途換快車者 (轉乘不計入出站人次)
          let alightedOrd = 0;
          let alightedBiz = 0;

          if (tr._onBoardOrd[s] > 0 || tr._onBoardBiz[s] > 0) {
            const ao = tr._onBoardOrd[s];
            const ab = tr._onBoardBiz[s];
            alightedOrd += ao;
            alightedBiz += ab;
            tr._onBoardOrd[s] = 0;
            tr._onBoardBiz[s] = 0;
            tr._totalOrd = Math.max(0, tr._totalOrd - ao);
            tr._totalBiz = Math.max(0, tr._totalBiz - ab);

            stationExits[s] += (ao + ab);
            stationHourlyExits[s][hr] += (ao + ab);
            stationSlotExits[s][slotId] += (ao + ab);
          }

          if (tr._xferOrd[s] > 0 || tr._xferBiz[s] > 0) {
            const xo = tr._xferOrd[s];
            const xb = tr._xferBiz[s];
            alightedOrd += xo;
            alightedBiz += xb;
            tr._xferOrd[s] = 0;
            tr._xferBiz[s] = 0;
            tr._totalOrd = Math.max(0, tr._totalOrd - xo);
            tr._totalBiz = Math.max(0, tr._totalBiz - xb);
          }

          // 若抵達終點站，清空車上任何未下車旅客
          if (isTerminal) {
            for (let d = 0; d < 22; d++) {
              const remFinal = tr._onBoardOrd[d] + tr._onBoardBiz[d];
              if (remFinal > 0) {
                alightedOrd += tr._onBoardOrd[d];
                alightedBiz += tr._onBoardBiz[d];
                stationExits[s] += remFinal;
                stationHourlyExits[s][hr] += remFinal;
                stationSlotExits[s][slotId] += remFinal;
                tr._onBoardOrd[d] = 0;
                tr._onBoardBiz[d] = 0;
              }
              const remXfer = tr._xferOrd[d] + tr._xferBiz[d];
              if (remXfer > 0) {
                alightedOrd += tr._xferOrd[d];
                alightedBiz += tr._xferBiz[d];
                tr._xferOrd[d] = 0;
                tr._xferBiz[d] = 0;
              }
            }
            tr._totalOrd = 0;
            tr._totalBiz = 0;
          }

          // 2) 上車 (Board): 只有非終點站才上客
          let boardedOrd = 0;
          let boardedBiz = 0;
          let leftBehindHere = 0;

          if (!isTerminal) {
            const dir = tr.dir;
            const spec = tr._spec;
            let remCapOrd = Math.max(0, spec.physCapOrd - tr._totalOrd);
            let remCapBiz = Math.max(0, spec.physCapBiz - tr._totalBiz);

            // 收集該站往此列車可達 (或可向前推進至快速轉乘站) 的候車需求
            const stepIndices = (dir === 'down')
              ? Array.from({ length: 21 - s }, (_, k) => s + 1 + k)
              : Array.from({ length: s }, (_, k) => s - 1 - k);

            // 檢查此車是否能向前推進到至少一個快速轉乘站
            let nextRapidAhead = -1;
            for (let k = si + 1; k < tr.stopNodes.length; k++) {
              if (RAPID_INDICES.has(tr.stopNodes[k].stationIdx)) {
                nextRapidAhead = tr.stopNodes[k].stationIdx;
                break;
              }
            }

            // 第一優先：Fallback 不挑車旅客；第二優先：階段 A 鎖定本列車的旅客
            const wantRequests = [];
            for (const d of stepIndices) {
              const pool = platformPools[s][d];
              const canReachDirect = tr._stopsMap.has(d);
              const canAdvanceToTransfer = !canReachDirect && nextRapidAhead !== -1 &&
                ((dir === 'down' && nextRapidAhead < d) || (dir === 'up' && nextRapidAhead > d));

              // 若本車無法直達也無法推進轉乘，但旅客原鎖定本車？不可能；若是 fallback 也不上無法抵達的車
              if (!canReachDirect && !canAdvanceToTransfer) continue;

              // a0) 三班車以上沒搭到者 (urgent)：只要能到達目的地(直達或轉乘)，最快到達或最早發車的車都上車
              if (pool.urgent > 0) {
                wantRequests.push({ d, qty: pool.urgent, kind: 'urgent', missCount: 3, canReachDirect });
              }
              // a) 階段 B：錯過 1~2 班後已重新查詢到本班者 (最早抵達目的地班次)
              const replan1Qty = pool.replan1.get(tr._uid) || 0;
              if (replan1Qty > 0) {
                wantRequests.push({ d, qty: replan1Qty, kind: 'replan', missCount: 1, src: 'replan1', canReachDirect });
              }
              const replan2Qty = pool.replan2.get(tr._uid) || 0;
              if (replan2Qty > 0) {
                wantRequests.push({ d, qty: replan2Qty, kind: 'replan', missCount: 2, src: 'replan2', canReachDirect });
              }
              // a2) 當日已無班次可查者 (保險機制：只要可達或能推進就上車)
              if (pool.fallback > 0) {
                wantRequests.push({ d, qty: pool.fallback, kind: 'fallback', missCount: 3, src: 'stranded', canReachDirect });
              }
              // b) Planned 旅客：鎖定本車者
              const plannedQty = pool.planned.get(tr._uid) || 0;
              if (plannedQty > 0) {
                wantRequests.push({ d, qty: plannedQty, kind: 'planned', missCount: 0, canReachDirect });
              }
            }

            // 計算總想上車人數，若超過剩餘物理空間則依比例擠上車、其餘留置
            let totalWant = 0;
            for (const req of wantRequests) totalWant += req.qty;

            if (totalWant > 0) {
              // 商務艙需求 (僅 135M 快速列車且直達快速站)
              let bizRatioBase = 0.045;
              if (s === 15 || s === 3) bizRatioBase = 0.11; // 機場/郵輪港商務客較高
              if (s === 4 || s === 7) bizRatioBase = 0.075;

              const availTotal = remCapOrd + remCapBiz;
              const baseCapTotal = spec.baseCapOrd + spec.baseCapBiz;
              const onBoardTotal = tr._totalOrd + tr._totalBiz;
              // 若乘車率超過 100%，超過 100% 部分的旅客優先挑下一班也能直達目的地的進站列車：
              // 預設每人 50% 機率改搭；若該下班車當前搭乘人數不滿 75%，意願提高為 75%
              const excessOver100 = Math.max(0, (onBoardTotal + totalWant) - baseCapTotal);
              const excessWant = Math.min(totalWant, excessOver100);
              const excessRatio = (totalWant > 0 && excessWant > 0) ? (excessWant / totalWant) : 0;

              let totalWillingWant = 0;
              const dirNext = (dir === 'down') ? 'down' : 'up';
              const depsHere = stationDepartures[s][dirNext];
              let nextLo = 0, nextHi = depsHere.length;
              while (nextLo < nextHi) {
                const mid = (nextLo + nextHi) >> 1;
                if (depsHere[mid].depSecs <= sn.depSecs) nextLo = mid + 1;
                else nextHi = mid;
              }

              for (const req of wantRequests) {
                let skipProb = 0;
                // 三班以上沒搭到(urgent)或 fallback 旅客不挑車，不主動改搭下一班
                if (excessRatio > 0 && req.kind !== 'urgent' && req.kind !== 'fallback') {
                  let nextDirectTr = null;
                  for (let ni = nextLo; ni < depsHere.length; ni++) {
                    if (depsHere[ni].tr._stopsMap.has(req.d)) {
                      nextDirectTr = depsHere[ni].tr;
                      break;
                    }
                  }
                  if (nextDirectTr) {
                    const nextCapBase = nextDirectTr._spec.baseCapOrd + nextDirectTr._spec.baseCapBiz;
                    const nextLoadRatio = nextCapBase > 0 ? ((nextDirectTr._totalOrd + nextDirectTr._totalBiz) / nextCapBase) : 1;
                    skipProb = (nextLoadRatio < 0.75) ? 0.75 : 0.50;
                  }
                }
                req._willingQty = req.qty * (1 - excessRatio * skipProb);
                totalWillingWant += req._willingQty;
              }

              const physScale = (totalWillingWant <= availTotal || totalWillingWant <= 0) ? 1.0 : (availTotal / totalWillingWant);

              for (const req of wantRequests) {
                const pool = platformPools[s][req.d];
                const boardTotal = Math.min(req.qty, Math.round(req._willingQty * physScale * 1000) / 1000);
                const missedQty = Math.max(0, req.qty - boardTotal);

                // 從原池扣除
                if (req.kind === 'urgent') {
                  pool.urgent = Math.max(0, pool.urgent - req.qty);
                } else if (req.kind === 'replan') {
                  if (req.src === 'replan1') pool.replan1.delete(tr._uid);
                  else pool.replan2.delete(tr._uid);
                } else if (req.kind === 'fallback') {
                  pool.fallback = Math.max(0, pool.fallback - req.qty);
                } else {
                  pool.planned.delete(tr._uid);
                }

                // 未能擠上車者 -> 留置，並累計未搭上次數 (達 3 班以上進入 urgent 池不挑車)
                if (missedQty > 0.01) {
                  replanQty(s, req.d, missedQty, sn.depSecs + 1, req.missCount || 0);
                  // 僅在首次從階段 A 被迫留置時累計人次，避免同一位旅客連等數班重複灌水
                  if (req.kind === 'planned') leftBehindHere += missedQty;
                }

                if (boardTotal <= 0.001) continue;

                // 分配商務艙 vs 普通艙
                let bBiz = 0;
                if (tr.is6Cars && req.canReachDirect && RAPID_INDICES.has(req.d) && remCapBiz > 0) {
                  const wantBiz = boardTotal * bizRatioBase;
                  bBiz = Math.min(remCapBiz, wantBiz);
                  remCapBiz -= bBiz;
                }
                const bOrd = Math.min(remCapOrd, boardTotal - bBiz);
                remCapOrd -= bOrd;
                const overflowMissed = Math.max(0, (boardTotal - bBiz - bOrd));
                if (overflowMissed > 0.01) {
                  replanQty(s, req.d, overflowMissed, sn.depSecs + 1, req.missCount || 0);
                  leftBehindHere += overflowMissed;
                }

                const actualBoarded = bOrd + bBiz;
                if (actualBoarded <= 0.001) continue;

                if (req.canReachDirect) {
                  tr._onBoardOrd[req.d] += bOrd;
                  tr._onBoardBiz[req.d] += bBiz;
                  tr._totalOrd += bOrd;
                  tr._totalBiz += bBiz;

                  // 記錄 OD 旅次與票務收入
                  const distKm = Math.abs(STATION_PROFILES[req.d].km - STATION_PROFILES[s].km);
                  // 定期票/IC卡平均實收折扣約為單程票之 88%
                  const ordFare = calculateFareFWC(distKm, 'single') * 0.88;
                  const bizFare = calculateFareFWC(distKm, 'business') * 0.92;
                  odTrips[s][req.d] += actualBoarded;
                  odBizTrips[s][req.d] += bBiz;
                  odRevenueFWC[s][req.d] += (bOrd * ordFare + bBiz * bizFare);

                  const destNode = tr.stopNodes[tr._stopsMap.get(req.d)];
                  const rideSecs = Math.max(60, destNode.arrSecs - sn.depSecs);
                  odSumRideSecs[s][req.d] += actualBoarded * rideSecs;

                  // 抽樣刷卡進出站明細 (僅收錄完整直達/代表性樣本)
                  if (collectSamples && sampleTapRecords.length < 360 && rng() < 0.028) {
                    const waitOffset = Math.round(randNormal(rng, 210, 85, 25, 650));
                    const tapInSec = sn.depSecs - waitOffset;
                    const tapOutSec = destNode.arrSecs + Math.round(randNormal(rng, 75, 25, 20, 180));
                    const isBizTrip = bBiz >= 0.5 && tr.is6Cars;
                    const ticketLabel = isBizTrip
                      ? '商務艙特急券'
                      : (rng() < 0.58 ? '飛灣國民卡 IC' : (rng() < 0.35 ? '30日定期票' : '單程票'));
                    const fareCharged = isBizTrip
                      ? calculateFareFWC(distKm, 'business')
                      : calculateFareFWC(distKm, 'single');
                    sampleTapRecords.push({
                      cardId: `FW-${String(Math.floor(rng() * 900000) + 100000)}`,
                      originCode: STATION_PROFILES[s].code,
                      originName: STATION_PROFILES[s].name,
                      destCode: STATION_PROFILES[req.d].code,
                      destName: STATION_PROFILES[req.d].name,
                      trainNum: tr.num,
                      trainType: tr.type,
                      tapInSec,
                      tapOutSec,
                      rideMins: Math.round((tapOutSec - tapInSec) / 60),
                      distKm: parseFloat(distKm.toFixed(1)),
                      ticketLabel,
                      fareFWC: parseFloat(fareCharged.toFixed(2)),
                      fareUSD: parseFloat((fareCharged * USD_PER_FWC).toFixed(2)),
                      wasFallback: (req.kind === 'fallback' || req.kind === 'replan' || req.kind === 'urgent')
                    });
                  }
                } else {
                  // 中途推進轉乘：先上車搭到 nextRapidAhead 下車進入轉乘池 (不計為車站出站)
                  tr._xferOrd[nextRapidAhead] += bOrd;
                  tr._xferBiz[nextRapidAhead] += bBiz;
                  tr._totalOrd += bOrd;
                  tr._totalBiz += bBiz;
                  const xNode = tr.stopNodes[tr._stopsMap.get(nextRapidAhead)];
                  platformPools[nextRapidAhead][req.d].transferQueue.push({
                    readySec: xNode.arrSecs + 45,
                    qty: actualBoarded,
                    fallback: (req.kind === 'fallback')
                  });
                }

                boardedOrd += bOrd;
                boardedBiz += bBiz;
                if (req.kind === 'fallback' || req.kind === 'replan' || req.kind === 'urgent') totalFallbackBoardings += actualBoarded;
              }
            }

            // 本列車已離開本站，任何原鎖定本列車卻因故未上車的殘餘旅客，依當下時刻重新查詢最早可上車的方式
            for (const d of stepIndices) {
              const pool = platformPools[s][d];
              const leftoverPlan = pool.planned.get(tr._uid) || 0;
              if (leftoverPlan > 0) {
                pool.planned.delete(tr._uid);
                replanQty(s, d, leftoverPlan, sn.depSecs + 1, 0);
              }
              const leftoverR1 = pool.replan1.get(tr._uid) || 0;
              if (leftoverR1 > 0) {
                pool.replan1.delete(tr._uid);
                replanQty(s, d, leftoverR1, sn.depSecs + 1, 1);
              }
              const leftoverR2 = pool.replan2.get(tr._uid) || 0;
              if (leftoverR2 > 0) {
                pool.replan2.delete(tr._uid);
                replanQty(s, d, leftoverR2, sn.depSecs + 1, 2);
              }
            }
          }

          totalBoardings += (boardedOrd + boardedBiz);
          totalBizBoardings += boardedBiz;
          totalLeftBehinds += leftBehindHere;
          stationLeftBehinds[s] += leftBehindHere;

          const loadPctOrd = (tr._totalOrd / tr._spec.baseCapOrd) * 100;
          const loadPctBiz = tr._spec.baseCapBiz > 0 ? (tr._totalBiz / tr._spec.baseCapBiz) * 100 : 0;
          const crowdLevel = getCrowdLevelFromPct(loadPctOrd);

          if (!isTerminal) {
            crowdDist[crowdLevel]++;
            stopSnapshotCount++;
          }

          tr._stopSnapshots.push({
            stationIdx: s,
            stationName: sn.cleanName,
            arrSecs: sn.arrSecs,
            depSecs: sn.depSecs,
            boardedOrd: Math.round(boardedOrd),
            boardedBiz: Math.round(boardedBiz),
            alightedOrd: Math.round(alightedOrd),
            alightedBiz: Math.round(alightedBiz),
            onBoardOrd: Math.round(tr._totalOrd),
            onBoardBiz: Math.round(tr._totalBiz),
            loadPctOrd: Math.round(loadPctOrd),
            loadPctBiz: Math.round(loadPctBiz),
            crowdLevel,
            leftBehind: Math.round(leftBehindHere)
          });
        }
      }

      // 統計該分鐘全線月台滯留人數
      let waitSum = 0;
      for (let o = 0; o < 22; o++) {
        for (let d = 0; d < 22; d++) {
          const p = platformPools[o][d];
          waitSum += p.fallback + p.urgent;
          for (const v of p.replan1.values()) waitSum += v;
          for (const v of p.replan2.values()) waitSum += v;
          for (const v of p.planned.values()) waitSum += v;
        }
      }
      minuteWaitingTotals[m] = waitSum;
    }

    // 整理列車索引表供 live.html 查詢
    const trainLookup = new Map();
    allTrains.forEach(tr => {
      trainLookup.set(tr._uid, {
        uid: tr._uid,
        is6Cars: tr.is6Cars,
        spec: tr._spec,
        snapshots: tr._stopSnapshots
      });
    });

    // 彙整各站統計資料
    const stationStats = STATION_PROFILES.map((st, idx) => {
      const entries = Math.round(stationEntries[idx]);
      const exits = Math.round(stationExits[idx]);
      return {
        ...st,
        entries,
        exits,
        total: entries + exits,
        hourlyEntries: Array.from(stationHourlyEntries[idx], Math.round),
        hourlyExits: Array.from(stationHourlyExits[idx], Math.round),
        slotEntries: { ...stationSlotEntries[idx] },
        slotExits: { ...stationSlotExits[idx] },
        leftBehinds: Math.round(stationLeftBehinds[idx])
      };
    });

    // 彙整前 25 大熱門 OD
    const topODPairs = [];
    let totalOdTrips = 0;
    let totalFareRevFWC = 0;
    let totalPaxKm = 0;

    for (let o = 0; o < 22; o++) {
      for (let d = 0; d < 22; d++) {
        if (o === d) continue;
        const trips = odTrips[o][d];
        if (trips <= 0) continue;
        totalOdTrips += trips;
        totalFareRevFWC += odRevenueFWC[o][d];
        const distKm = Math.abs(STATION_PROFILES[d].km - STATION_PROFILES[o].km);
        totalPaxKm += trips * distKm;
        topODPairs.push({
          oIdx: o,
          dIdx: d,
          originCode: STATION_PROFILES[o].code,
          originName: STATION_PROFILES[o].name,
          destCode: STATION_PROFILES[d].code,
          destName: STATION_PROFILES[d].name,
          trips: Math.round(trips),
          bizTrips: Math.round(odBizTrips[o][d]),
          distKm: parseFloat(distKm.toFixed(1)),
          avgRideMins: Math.round((odSumRideSecs[o][d] / trips) / 60),
          revenueFWC: Math.round(odRevenueFWC[o][d]),
          revenueUSD: Math.round(odRevenueFWC[o][d] * USD_PER_FWC)
        });
      }
    }
    topODPairs.sort((a, b) => b.trips - a.trips);
    sampleTapRecords.sort((a, b) => a.tapInSec - b.tapInSec);

    const result = {
      schedType,
      dayType,
      year,
      seedKey,
      trainLookup,
      stationStats,
      odTrips: odTrips.map(row => Array.from(row, v => Math.round(v))),
      topODPairs,
      sampleTapRecords,
      minuteWaitingTotals,
      summary: {
        totalTrains: allTrains.length,
        totalBoardings: Math.round(totalBoardings),
        totalOdTrips: Math.round(totalOdTrips),
        totalBizBoardings: Math.round(totalBizBoardings),
        totalLeftBehinds: Math.round(totalLeftBehinds),
        leftBehindRatePct: totalBoardings > 0 ? parseFloat(((totalLeftBehinds / totalBoardings) * 100).toFixed(2)) : 0,
        fallbackSharePct: totalBoardings > 0 ? parseFloat(((totalFallbackBoardings / totalBoardings) * 100).toFixed(2)) : 0,
        totalFareRevFWC: Math.round(totalFareRevFWC),
        totalFareRevUSD: Math.round(totalFareRevFWC * USD_PER_FWC),
        avgTripKm: totalOdTrips > 0 ? parseFloat((totalPaxKm / totalOdTrips).toFixed(2)) : 0,
        crowdDist,
        stopSnapshotCount
      }
    };

    _daySimCache.set(cacheKey, result);
    return result;
  }

  // =========================================================
  // 9. live.html 專用即時乘車率查詢介面
  // =========================================================
  function computeLiveDaySim(downTimelines, upTimelines, schedType, serviceKey, currentTime) {
    const ctx = resolveDayContext(currentTime || new Date());
    const simResult = simulateDayOperations({
      schedType: schedType || ctx.schedType,
      dayType: ctx.dayType,
      year: (currentTime || new Date()).getFullYear(),
      seedKey: `${serviceKey || 'today'}-${schedType || ctx.schedType}`,
      isFinalsWeek: ctx.isFinalsWeek,
      timelines: { down: downTimelines, up: upTimelines },
      collectSamples: false
    });
    return simResult;
  }

  function getTrainLoadAtTime(simResult, tl, simTimeSecs, liveState) {
    const is6Cars = (tl.gameType === 'express' || tl.length === 130);
    const spec = getTrainCapacitySpec(is6Cars);
    const fallbackRes = {
      is6Cars,
      formationLabel: spec.formationLabel,
      onBoardOrd: 0,
      onBoardBiz: 0,
      capOrdBase: spec.baseCapOrd,
      capOrdMax: spec.physCapOrd,
      capBiz: spec.baseCapBiz,
      loadPct: 0,
      loadPctBiz: 0,
      crowding: 1,
      leftBehind: 0
    };
    if (!simResult || !simResult.trainLookup) return fallbackRes;

    const uid = `${tl.dir}-${tl.num}`;
    const rec = simResult.trainLookup.get(uid);
    if (!rec || !rec.snapshots || rec.snapshots.length === 0) return fallbackRes;

    const tNorm = normalizeTimetableSecs(simTimeSecs);
    const snaps = rec.snapshots;

    // 找出目前停靠中或剛駛離之車站快照 (車門關閉行駛期間維持鎖定剛發車站之人數)
    let chosen = snaps[0];
    for (let i = 0; i < snaps.length; i++) {
      if (tNorm >= snaps[i].arrSecs) {
        chosen = snaps[i];
      } else {
        break;
      }
    }

    // 停靠中：開門瞬間減少到達目的地之下車旅客；關門瞬間增加選擇搭乘該班車之上車旅客
    if (liveState && liveState.isStoppedAtStation && tNorm >= chosen.arrSecs && tNorm < chosen.depSecs) {
      const prevIdx = Math.max(0, snaps.indexOf(chosen) - 1);
      const prev = snaps[prevIdx];
      let ord = prev.onBoardOrd;
      let biz = prev.onBoardBiz;
      let leftBehind = 0;
      if (liveState.doorsWereClosed) {
        ord = chosen.onBoardOrd;
        biz = chosen.onBoardBiz;
        leftBehind = chosen.leftBehind;
      } else if (liveState.doorOpen || liveState.doorClosing) {
        ord = Math.max(0, prev.onBoardOrd - (chosen.alightedOrd || 0));
        biz = Math.max(0, prev.onBoardBiz - (chosen.alightedBiz || 0));
      }
      const loadPct = Math.round((ord / spec.baseCapOrd) * 100);
      const loadPctBiz = spec.baseCapBiz > 0 ? Math.round((biz / spec.baseCapBiz) * 100) : 0;
      return {
        is6Cars,
        formationLabel: spec.formationLabel,
        onBoardOrd: ord,
        onBoardBiz: biz,
        capOrdBase: spec.baseCapOrd,
        capOrdMax: spec.physCapOrd,
        capBiz: spec.baseCapBiz,
        loadPct,
        loadPctBiz,
        crowding: getCrowdLevelFromPct(loadPct),
        leftBehind
      };
    }

    return {
      is6Cars,
      formationLabel: spec.formationLabel,
      onBoardOrd: chosen.onBoardOrd,
      onBoardBiz: chosen.onBoardBiz,
      capOrdBase: spec.baseCapOrd,
      capOrdMax: spec.physCapOrd,
      capBiz: spec.baseCapBiz,
      loadPct: chosen.loadPctOrd,
      loadPctBiz: chosen.loadPctBiz,
      crowding: chosen.crowdLevel,
      leftBehind: chosen.leftBehind
    };
  }

  // =========================================================
  // 10. 年度日期推演、多日區間聚合與三大財務報表精算引擎 (2020 ~ 當日/新年度自動擴展)
  // =========================================================
  function getReportingDateContext(refDateInput) {
    const refDate = (refDateInput instanceof Date && !isNaN(refDateInput.getTime()))
      ? refDateInput
      : new Date();
    const currentYear = refDate.getFullYear();
    const currentMonth = refDate.getMonth() + 1;
    const currentDay = refDate.getDate();
    const isLeap = isFlywanLeapYear(currentYear);
    const totalDaysInYear = isLeap ? 366 : 365;
    const utcStart = Date.UTC(currentYear, 0, 1);
    const utcNow = Date.UTC(currentYear, currentMonth - 1, currentDay);
    const dayOfYear = Math.min(totalDaysInYear, Math.max(1, Math.floor((utcNow - utcStart) / 86400000) + 1));
    const ytdFraction = dayOfYear / totalDaysInYear;
    const todayStr = `${currentYear}/${String(currentMonth).padStart(2, '0')}/${String(currentDay).padStart(2, '0')}`;
    const isoDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
    return {
      refDate,
      currentYear,
      currentMonth,
      currentDay,
      totalDaysInYear,
      dayOfYear,
      ytdFraction,
      todayStr,
      isoDate
    };
  }

  function getBaseDaySims() {
    return {
      weekday: simulateDayOperations({ schedType: 'weekday', dayType: 'weekday', year: 2026, seedKey: 'fin-base-weekday', collectSamples: false }),
      friday: simulateDayOperations({ schedType: 'weekday', dayType: 'friday', year: 2026, seedKey: 'fin-base-friday', collectSamples: false }),
      holiday: simulateDayOperations({ schedType: 'holiday', dayType: 'holiday', year: 2026, seedKey: 'fin-base-holiday', collectSamples: false }),
      holiday_long: simulateDayOperations({ schedType: 'holiday_long', dayType: 'holiday_long', year: 2026, seedKey: 'fin-base-long', collectSamples: false }),
      weekday_to_long: simulateDayOperations({ schedType: 'weekday_to_long', dayType: 'weekday_to_long', year: 2026, seedKey: 'fin-base-w2l', collectSamples: false }),
      long_to_weekday: simulateDayOperations({ schedType: 'long_to_weekday', dayType: 'long_to_weekday', year: 2026, seedKey: 'fin-base-l2w', collectSamples: false })
    };
  }

  function countDayTypesInDateRange(startUtcMs, endUtcMs) {
    const counts = { weekday: 0, friday: 0, holiday: 0, holiday_long: 0, weekday_to_long: 0, long_to_weekday: 0 };
    let totalDays = 0;
    for (let t = startUtcMs; t <= endUtcMs; t += 86400000) {
      const dt = new Date(t);
      const localD = new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 12, 0, 0);
      const ctx = resolveDayContext(localD);
      const k = counts[ctx.dayType] !== undefined ? ctx.dayType : 'weekday';
      counts[k]++;
      totalDays++;
    }
    return { counts, totalDays };
  }

  const _periodCache = new Map();
  function simulatePeriodStats(periodKey = '2026', schedFilter = 'all', refDateInput) {
    const dateCtx = getReportingDateContext(refDateInput);
    const cacheKey = `${periodKey}|${schedFilter || 'all'}|${dateCtx.isoDate}`;
    if (_periodCache.has(cacheKey)) return _periodCache.get(cacheKey);

    const rng = createRNG(`flywan-period-${periodKey}-${schedFilter}-${dateCtx.currentYear}`);
    const baseSims = getBaseDaySims();

    // 決定統計起訖區間
    let startUtc, endUtc, periodLabel, isYTD = false, isDailyAvg = false;
    const keyStr = String(periodKey || dateCtx.currentYear);

    if (keyStr === 'rolling_1y' || keyStr === 'rolling_1y_daily') {
      isDailyAvg = (keyStr === 'rolling_1y_daily');
      endUtc = Date.UTC(dateCtx.currentYear, dateCtx.currentMonth - 1, dateCtx.currentDay);
      const sDate = new Date(dateCtx.currentYear - 1, dateCtx.currentMonth - 1, dateCtx.currentDay);
      sDate.setDate(sDate.getDate() + 1);
      startUtc = Date.UTC(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
      const sStr = `${sDate.getFullYear()}/${String(sDate.getMonth() + 1).padStart(2, '0')}/${String(sDate.getDate()).padStart(2, '0')}`;
      periodLabel = isDailyAvg
        ? `近一年年平均日 (${sStr} – ${dateCtx.todayStr} 之平均單日)`
        : `近一年滾動統計 (${sStr} – ${dateCtx.todayStr})`;
    } else if (keyStr === 'rolling_1m') {
      endUtc = Date.UTC(dateCtx.currentYear, dateCtx.currentMonth - 1, dateCtx.currentDay);
      const sDate = new Date(dateCtx.currentYear, dateCtx.currentMonth - 2, dateCtx.currentDay);
      sDate.setDate(sDate.getDate() + 1);
      startUtc = Date.UTC(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
      const sStr = `${sDate.getFullYear()}/${String(sDate.getMonth() + 1).padStart(2, '0')}/${String(sDate.getDate()).padStart(2, '0')}`;
      periodLabel = `近一個月滾動統計 (${sStr} – ${dateCtx.todayStr})`;
    } else if (/^\d{4}-\d{2}$/.test(keyStr)) {
      const [yRaw, mRaw] = keyStr.split('-').map(Number);
      const y = Math.min(dateCtx.currentYear, Math.max(2020, yRaw));
      const maxM = (y === dateCtx.currentYear) ? dateCtx.currentMonth : 12;
      const m = Math.min(maxM, Math.max(1, mRaw));
      startUtc = Date.UTC(y, m - 1, 1);
      if (y === dateCtx.currentYear && m === dateCtx.currentMonth) {
        endUtc = Date.UTC(y, m - 1, dateCtx.currentDay);
        isYTD = true;
        periodLabel = `${y} 年 ${String(m).padStart(2, '0')} 月至今 (${y}/${String(m).padStart(2, '0')}/01 – ${dateCtx.todayStr}，推演至當日)`;
      } else {
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        endUtc = Date.UTC(y, m - 1, lastDay);
        periodLabel = `${y} 年 ${String(m).padStart(2, '0')} 月 (${y}/${String(m).padStart(2, '0')}/01 – ${y}/${String(m).padStart(2, '0')}/${String(lastDay).padStart(2, '0')})`;
      }
    } else {
      const y = Math.min(dateCtx.currentYear, Math.max(2020, parseInt(keyStr, 10) || dateCtx.currentYear));
      if (y === 2021) {
        startUtc = Date.UTC(2021, 2, 1); // 2021/03/01 通車
        endUtc = Date.UTC(2021, 11, 31);
        periodLabel = '2021 年度 (2021/03/01 通車起 – 2021/12/31)';
      } else if (y === dateCtx.currentYear) {
        startUtc = Date.UTC(y, 0, 1);
        endUtc = Date.UTC(y, dateCtx.currentMonth - 1, dateCtx.currentDay);
        isYTD = true;
        periodLabel = `${y} 年度至今 (${y}/01/01 – ${dateCtx.todayStr}，推演至當日)`;
      } else {
        startUtc = Date.UTC(y, 0, 1);
        endUtc = Date.UTC(y, 11, 31);
        periodLabel = y === 2020
          ? '2020 年度 (2020/01/01 – 2020/12/31 籌備暨試運轉)'
          : `${y} 全年度 (${y}/01/01 – ${y}/12/31)`;
      }
    }

    // 依每年度之有效日型分布加權累計 (確保跨年之 rolling_1y 各年適用對應 demandScale)
    const weightByDayType = { weekday: 0, friday: 0, holiday: 0, holiday_long: 0, weekday_to_long: 0, long_to_weekday: 0 };
    let totalDays = 0;

    for (let t = startUtc; t <= endUtc; t += 86400000) {
      const dt = new Date(t);
      const y = dt.getUTCFullYear();
      const mon = dt.getUTCMonth() + 1;
      const localD = new Date(y, dt.getUTCMonth(), dt.getUTCDate(), 12, 0, 0);
      const ctx = resolveDayContext(localD);
      const dtKey = (schedFilter && schedFilter !== 'all' && baseSims[schedFilter])
        ? schedFilter
        : (weightByDayType[ctx.dayType] !== undefined ? ctx.dayType : 'weekday');

      const yf = getYearHistoryFactor(y);
      const isTrialOnly = (y === 2020) || (y === 2021 && mon < 3);
      const yearOpScale = isTrialOnly ? (1.3 / 12.0) : 1.0;
      weightByDayType[dtKey] += yf.demandScale * yearOpScale;
      totalDays++;
    }

    // 若為「近一年年平均日」，將累計權重除以實際天數 (轉為平均單日水準)
    if (isDailyAvg && totalDays > 0) {
      for (const k of Object.keys(weightByDayType)) {
        weightByDayType[k] /= totalDays;
      }
    }

    const noise = randNormal(rng, 1.0, 0.012, 0.96, 1.04);
    const odTrips = Array.from({ length: 22 }, () => new Float64Array(22));
    const odRevenueFWC = Array.from({ length: 22 }, () => new Float64Array(22));
    const odBizTrips = Array.from({ length: 22 }, () => new Float64Array(22));
    const odWeightedRideSec = Array.from({ length: 22 }, () => new Float64Array(22));

    const stEntries = new Float64Array(22);
    const stExits = new Float64Array(22);
    const stLeftBehinds = new Float64Array(22);
    const stHourlyEntries = Array.from({ length: 22 }, () => new Float64Array(24));
    const stHourlyExits = Array.from({ length: 22 }, () => new Float64Array(24));

    let totalBoardings = 0;
    let totalOdTrips = 0;
    let totalBizBoardings = 0;
    let totalFareRevFWC = 0;
    let totalPaxKm = 0;

    for (const [dtKey, w] of Object.entries(weightByDayType)) {
      if (w <= 0) continue;
      const sim = baseSims[dtKey];
      const effW = w * noise;

      totalBoardings += sim.summary.totalBoardings * effW;
      totalBizBoardings += sim.summary.totalBizBoardings * effW;

      for (let s = 0; s < 22; s++) {
        const st = sim.stationStats[s];
        stEntries[s] += st.entries * effW;
        stExits[s] += st.exits * effW;
        stLeftBehinds[s] += st.leftBehinds * effW;
        for (let h = 0; h < 24; h++) {
          stHourlyEntries[s][h] += st.hourlyEntries[h] * effW;
          stHourlyExits[s][h] += st.hourlyExits[h] * effW;
        }
      }

      for (let o = 0; o < 22; o++) {
        for (let d = 0; d < 22; d++) {
          if (o === d) continue;
          const tVal = sim.odTrips[o][d];
          if (tVal <= 0) continue;
          const addTrips = tVal * effW;
          odTrips[o][d] += addTrips;
          totalOdTrips += addTrips;
          const distKm = Math.abs(STATION_PROFILES[d].km - STATION_PROFILES[o].km);
          totalPaxKm += addTrips * distKm;
        }
      }
      // 依每個 sim 的站對明細補齊收入、商務人次與乘車時間
      sim.topODPairs.forEach(p => {
        odRevenueFWC[p.oIdx][p.dIdx] += p.revenueFWC * effW;
        odBizTrips[p.oIdx][p.dIdx] += p.bizTrips * effW;
        odWeightedRideSec[p.oIdx][p.dIdx] += (p.avgRideMins * 60) * (p.trips * effW);
        totalFareRevFWC += p.revenueFWC * effW;
      });
    }

    const stationStats = STATION_PROFILES.map((st, idx) => {
      const entries = Math.round(stEntries[idx]);
      const exits = Math.round(stExits[idx]);
      return {
        ...st,
        entries,
        exits,
        total: entries + exits,
        leftBehinds: Math.round(stLeftBehinds[idx]),
        hourlyEntries: Array.from(stHourlyEntries[idx], Math.round),
        hourlyExits: Array.from(stHourlyExits[idx], Math.round)
      };
    });

    const odPairs = [];
    for (let o = 0; o < 22; o++) {
      for (let d = 0; d < 22; d++) {
        if (o === d) continue;
        const trips = odTrips[o][d];
        if (trips <= 0) continue;
        const distKm = Math.abs(STATION_PROFILES[d].km - STATION_PROFILES[o].km);
        const revFwc = odRevenueFWC[o][d] > 0
          ? odRevenueFWC[o][d]
          : trips * calculateFareFWC(distKm, 'single') * 0.88;
        const avgMins = odWeightedRideSec[o][d] > 0
          ? Math.round((odWeightedRideSec[o][d] / trips) / 60)
          : Math.max(2, Math.round(distKm * 1.35 + 2));
        odPairs.push({
          oIdx: o,
          dIdx: d,
          originCode: STATION_PROFILES[o].code,
          originName: STATION_PROFILES[o].name,
          destCode: STATION_PROFILES[d].code,
          destName: STATION_PROFILES[d].name,
          trips: Math.round(trips),
          bizTrips: Math.round(odBizTrips[o][d]),
          distKm: parseFloat(distKm.toFixed(1)),
          avgRideMins: avgMins,
          revenueFWC: Math.round(revFwc),
          revenueUSD: Math.round(revFwc * USD_PER_FWC)
        });
      }
    }
    odPairs.sort((a, b) => b.trips - a.trips);

    const avgDailyTrips = isDailyAvg
      ? Math.round(totalOdTrips)
      : (totalDays > 0 ? Math.round(totalOdTrips / totalDays) : 0);
    const result = {
      periodKey: keyStr,
      periodLabel,
      isYTD,
      isDailyAvg,
      totalDays,
      asOfDateStr: dateCtx.todayStr,
      seedIndicator: `flywan-period-${keyStr}-${dateCtx.isoDate}`,
      odTrips: odTrips.map(row => Array.from(row, v => Math.round(v))),
      topODPairs: odPairs,
      stationStats,
      summary: {
        totalOdTrips: Math.round(totalOdTrips),
        avgDailyTrips,
        totalBoardings: Math.round(totalBoardings),
        totalBizBoardings: Math.round(totalBizBoardings),
        totalFareRevFWC: Math.round(totalFareRevFWC),
        totalFareRevUSD: Math.round(totalFareRevFWC * USD_PER_FWC),
        avgTripKm: totalOdTrips > 0 ? parseFloat((totalPaxKm / totalOdTrips).toFixed(2)) : 0,
        totalLeftBehinds: Math.round(stLeftBehinds.reduce((a, b) => a + b, 0))
      }
    };
    _periodCache.set(cacheKey, result);
    return result;
  }

  const _financialCache = new Map();

  function buildAllFinancialReports(refOrMaxYear) {
    const dateCtx = getReportingDateContext(refOrMaxYear instanceof Date ? refOrMaxYear : new Date());
    const explicitMax = (typeof refOrMaxYear === 'number') ? refOrMaxYear : dateCtx.currentYear;
    const endYear = Math.max(dateCtx.currentYear, explicitMax);
    const cacheKey = `${endYear}|${dateCtx.isoDate}`;
    if (_financialCache.has(cacheKey)) return _financialCache.get(cacheKey);

    const baseSims = getBaseDaySims();
    const simWeekday = baseSims.weekday;
    const simFriday = baseSims.friday;
    const simHoliday = baseSims.holiday;
    const simLongHol = baseSims.holiday_long;
    const simW2L = baseSims.weekday_to_long;
    const simL2W = baseSims.long_to_weekday;

    // 飛灣曆一年各種日期天數統計：平日約 214 天、小週末 68 天、一般假日 61 天、連假 18 天、接連假/接平日各 2 天 (合計 365)
    const baseAnnualTrips2026 =
      simWeekday.summary.totalOdTrips * 214 +
      simFriday.summary.totalOdTrips * 68 +
      simHoliday.summary.totalOdTrips * 61 +
      simLongHol.summary.totalOdTrips * 18 +
      simW2L.summary.totalOdTrips * 2 +
      simL2W.summary.totalOdTrips * 2;

    const baseAnnualFare2026 =
      simWeekday.summary.totalFareRevFWC * 214 +
      simFriday.summary.totalFareRevFWC * 68 +
      simHoliday.summary.totalFareRevFWC * 61 +
      simLongHol.summary.totalFareRevFWC * 18 +
      simW2L.summary.totalFareRevFWC * 2 +
      simL2W.summary.totalFareRevFWC * 2;

    const baseAnnualBiz2026 =
      simWeekday.summary.totalBizBoardings * 214 +
      simFriday.summary.totalBizBoardings * 68 +
      simHoliday.summary.totalBizBoardings * 61 +
      simLongHol.summary.totalBizBoardings * 18 +
      simW2L.summary.totalBizBoardings * 2 +
      simL2W.summary.totalBizBoardings * 2;

    const reports = {};
    // 連續跨年度資產負債/現金流狀態 (單位：千飛灣幣 kFWC；1 飛灣幣 = 10 美元 => 1 千飛灣幣 = 10 千美元)
    let cash = 0;
    let ar = 0;
    let inventory = 0;
    let ppeGross = 0;
    let accumDep = 0;
    let rouAndIntangible = 0;

    let ap = 0;
    let unearnedRev = 0;
    let longTermDebt = 0;
    let greenBonds = 0;
    let shareCapital = 0;
    let capitalSurplus = 0;
    let retainedEarnings = 0;

    for (let y = 2020; y <= endYear; y++) {
      const rng = createRNG(`flywan-financial-year-${y}`);
      const h = getYearHistoryFactor(y);
      const isLeap = isFlywanLeapYear(y);
      const daysInY = isLeap ? 366 : 365;
      const dayAdj = isLeap ? (366 / 365) : 1.0;

      // 當年度 (currentYear) 依截至當日天數統計 (YTD)，過去已完成年度按全年度營運比例統計
      const isCurrentYTD = (y === dateCtx.currentYear);
      const ytdRatio = isCurrentYTD ? dateCtx.ytdFraction : 1.0;
      const opDays = isCurrentYTD
        ? dateCtx.dayOfYear
        : (y === 2020 ? Math.round(daysInY * (h.activeMonths / 12.0)) : (y === 2021 ? 306 : daysInY));

      const opFraction = (h.activeMonths / 12.0) * ytdRatio;
      const noiseFactor = randNormal(rng, 1.0, 0.025, 0.94, 1.06);
      const annualTrips = Math.round(baseAnnualTrips2026 * h.demandScale * opFraction * dayAdj * noiseFactor);

      // 換算成千飛灣幣 (kFWC)
      const fareFromModelK = (baseAnnualFare2026 * h.demandScale * opFraction * dayAdj * noiseFactor) / 1000;
      const bizShare = (y === 2020) ? 0.02 : (baseAnnualBiz2026 / Math.max(1, baseAnnualTrips2026));

      // 收入拆解 (參考 tickets.html 各票種結構)
      const revBusinessK = Math.round(fareFromModelK * (bizShare * 3.1));
      const revRegularPassK = Math.round(fareFromModelK * randNormal(rng, 0.24, 0.012, 0.20, 0.28));
      const revHolidayPkgK = Math.round(fareFromModelK * randNormal(rng, 0.028, 0.004, 0.015, 0.045));
      const revLuggageK = Math.round(fareFromModelK * randNormal(rng, 0.016, 0.002, 0.010, 0.025));
      const revSingleAndICK = Math.max(0, Math.round(fareFromModelK - revBusinessK - revRegularPassK - revHolidayPkgK - revLuggageK));
      const totalPassengerRevK = revSingleAndICK + revBusinessK + revRegularPassK + revHolidayPkgK + revLuggageK;

      // 附屬事業與車站商業收入 (2024 環狀線後車站商場/廣告大幅成長；當年度按 YTD 比例認列)
      const commFactor = (y <= 2020) ? 0.12 : (y === 2021 ? 0.42 : (y === 2022 ? 0.68 : (y === 2023 ? 0.85 : (y === 2024 ? 1.05 : 1.18 + Math.max(0, y - 2025) * 0.03))));
      const revRetailLeaseK = Math.round(4200 * commFactor * ytdRatio * randNormal(rng, 1.0, 0.04, 0.9, 1.1));
      const revAdsAndAirportK = Math.round(3100 * commFactor * ytdRatio * randNormal(rng, 1.0, 0.04, 0.9, 1.1));
      const totalAncillaryRevK = revRetailLeaseK + revAdsAndAirportK;
      const totalRevenueK = totalPassengerRevK + totalAncillaryRevK;

      // 資本支出 CapEx 與資產建設節奏 (kFWC；當年度依 YTD 比例認列)
      let capexK = 0;
      let equityIssueK = 0;
      let debtDrawK = 0;
      let debtRepayK = 0;
      let bondIssueK = 0;
      let assetDisposalLossK = 0;

      if (y === 2020) {
        // 創設募資與土建發包
        equityIssueK = 120000;
        debtDrawK = 105000;
        capexK = 142000;
      } else if (y === 2021) {
        // 機場段完工與 E300 列車交車
        equityIssueK = 20000;
        debtDrawK = 48000;
        capexK = 62000;
      } else if (y === 2022) {
        // 海莊至夏城全線貫通工程尾款
        debtDrawK = 25000;
        capexK = 36000;
      } else if (y === 2023) {
        capexK = 8500;
        debtRepayK = 6000;
      } else if (y === 2024) {
        // 環狀線聯合開發與擴充編組
        bondIssueK = 22000;
        capexK = 24000;
        debtRepayK = 8000;
      } else if (y === 2025) {
        // 海岸景觀復育與綠色縫合前置轉型投資
        capexK = 10500;
        debtRepayK = 9500;
      } else {
        // 2026+ 路廊升級與設備例行汰換 (當年度依 YTD 比例推進)
        capexK = Math.round(7200 * ytdRatio * randNormal(rng, 1.0, 0.06, 0.85, 1.15));
        debtRepayK = Math.round(10000 * ytdRatio);
        if (y === 2026) assetDisposalLossK = 1450; // 2026/01 海岸重軌設施除役重整一次性處分損失
      }

      ppeGross += capexK;
      if (y === 2026) ppeGross -= 2400; // 除役部分海岸重軌資產

      // 營業成本 (Operating Costs；當年度固定人力與折舊按 YTD 期間提列)
      const staffHeadcountScale = (y === 2020) ? 0.36 : (y === 2021 ? 0.62 : (y === 2022 ? 0.82 : (y === 2023 ? 0.90 : 0.96 + (y - 2024) * 0.015)));
      const costLaborK = Math.round(12200 * staffHeadcountScale * ytdRatio * randNormal(rng, 1.0, 0.015, 0.96, 1.04));
      const costPowerK = Math.round((y === 2020 ? 420 : 4100 * (0.45 * ytdRatio + 0.55 * h.demandScale * opFraction)) * randNormal(rng, 1.0, 0.03, 0.92, 1.08));
      const costMaintK = Math.round((y === 2020 ? 520 : 5100 * (0.40 * ytdRatio + 0.60 * h.demandScale * opFraction)) * randNormal(rng, 1.0, 0.03, 0.92, 1.08));
      const depRate = ((y === 2020) ? 0.008 : (y === 2021 ? 0.018 : 0.022)) * ytdRatio;
      const costDepK = Math.round(ppeGross * depRate);
      if (y === 2026) accumDep -= 950; // 配合除役沖銷累計折舊
      accumDep += costDepK;

      const totalCostK = costLaborK + costPowerK + costMaintK + costDepK;
      const grossProfitK = totalRevenueK - totalCostK;

      // 營業費用 (Operating Expenses)
      const opexAdminK = Math.round(2150 * (0.5 + 0.5 * staffHeadcountScale) * ytdRatio * randNormal(rng, 1.0, 0.02, 0.95, 1.05));
      const opexMarketingK = Math.round((y >= 2024 ? 1250 : 820) * ytdRatio * randNormal(rng, 1.0, 0.04, 0.90, 1.12));
      const opexComplianceK = Math.round(720 * (0.6 + 0.4 * staffHeadcountScale) * ytdRatio); // 監管部內控與安全保險
      const totalOpexK = opexAdminK + opexMarketingK + opexComplianceK;

      const operatingIncomeK = grossProfitK - totalOpexK;

      // 營業外收支
      const nonOpSubsidyAndInterestK = Math.round(((y >= 2025 ? 1850 : 950) + Math.max(0, cash * 0.020)) * ytdRatio); // 綠色交通補助 + 存款利息
      const avgDebt = longTermDebt + greenBonds + (debtDrawK + bondIssueK - debtRepayK) * 0.5;
      const interestExpK = Math.round(avgDebt * 0.022 * ytdRatio);
      const nonOpNetK = nonOpSubsidyAndInterestK - interestExpK - assetDisposalLossK;

      const ebtK = operatingIncomeK + nonOpNetK;
      const taxRate = 0.20;
      const incomeTaxK = ebtK > 0 ? Math.round(ebtK * taxRate) : 0;
      const netIncomeK = ebtK - incomeTaxK;

      // 股利政策：獲利且累積盈餘為正時發放約 30% 現金股利
      let dividendsK = 0;
      if (netIncomeK > 0 && (retainedEarnings + netIncomeK) > 3000) {
        dividendsK = Math.round(netIncomeK * 0.30);
      }

      // 營運資金變動與資產負債表項目更新
      const prevAr = ar, prevInv = inventory, prevAp = ap, prevUnearned = unearnedRev;
      ar = Math.round(totalRevenueK * randNormal(rng, 0.055, 0.004, 0.045, 0.068));
      inventory = Math.round((y === 2020 ? 1200 : 1800 + costMaintK * 0.22));
      rouAndIntangible = Math.round(3200 + (y >= 2024 ? 1800 : 600));
      ap = Math.round((costPowerK + costMaintK + totalOpexK) * randNormal(rng, 0.14, 0.01, 0.11, 0.17));
      unearnedRev = Math.round(revRegularPassK * 0.18 + totalPassengerRevK * 0.025); // 定期票遞延與國民卡儲值餘額

      const dAr = ar - prevAr;
      const dInv = inventory - prevInv;
      const dAp = ap - prevAp;
      const dUnearned = unearnedRev - prevUnearned;

      // 現金流量表 (間接法)
      const ocfWorkingCapK = -dAr - dInv + dAp + dUnearned;
      const ocfK = netIncomeK + costDepK + assetDisposalLossK + ocfWorkingCapK;
      const icfCapexK = -capexK;
      const icfIntangibleK = (y === 2020) ? -3800 : (y === 2024 ? -1200 : 0);
      const icfK = icfCapexK + icfIntangibleK;

      const fcfK = equityIssueK + debtDrawK + bondIssueK - debtRepayK - dividendsK;
      const netCashChangeK = ocfK + icfK + fcfK;
      const beginCashK = cash;
      cash = beginCashK + netCashChangeK;

      // 更新負債與權益
      longTermDebt = longTermDebt + debtDrawK - debtRepayK;
      greenBonds = greenBonds + bondIssueK;
      shareCapital += Math.round(equityIssueK * 0.85);
      capitalSurplus += Math.round(equityIssueK * 0.15);
      retainedEarnings = retainedEarnings + netIncomeK - dividendsK;

      // 修正無形資產變動使資產負債表與現金流 100% 精確平帳
      // 檢查：ΔAssets = ΔCash + ΔAR + ΔInv + CapEx - Dep - DisposalNet + ΔIntangible
      // ΔCash = NI + Dep + DisposalLoss - ΔAR - ΔInv + ΔAP + ΔUnearned - CapEx + icfIntangible + Eq + DebtNet - Div
      // => ΔCash + ΔAR + ΔInv + (CapEx - Dep - DisposalLoss) = NI + ΔAP + ΔUnearned + Eq + DebtNet - Div + icfIntangible
      // 因此若把 rouAndIntangible 精確設為累積 (-icfIntangibleK) 並把資產除役帳面淨值 (2400 - 950 = 1450) 與 assetDisposalLossK 對齊，Assets 必然嚴格等於 Liabilities + Equity！
      if (y === 2020) rouAndIntangible = 3800;
      else if (y === 2024) rouAndIntangible = 5000;
      else if (y > 2024) rouAndIntangible = 5000;
      else rouAndIntangible = 3800;

      const netPPEK = ppeGross - accumDep;
      const currentAssetsK = cash + ar + inventory;
      const nonCurrentAssetsK = netPPEK + rouAndIntangible;
      const totalAssetsK = currentAssetsK + nonCurrentAssetsK;

      const shortTermDebtK = Math.min(longTermDebt, 10000);
      const nonCurrentDebtK = longTermDebt - shortTermDebtK;
      const currentLiabK = ap + unearnedRev + shortTermDebtK;
      const nonCurrentLiabK = nonCurrentDebtK + greenBonds;
      const totalLiabK = currentLiabK + nonCurrentLiabK;

      const totalEquityK = shareCapital + capitalSurplus + retainedEarnings;
      const totalLiabAndEquityK = totalLiabK + totalEquityK;

      const sharesThousand = Math.round(shareCapital / 0.01); // 面額 0.01 飛灣幣 (=0.1 美元) 或以每萬股計算
      const epsFWC = shareCapital > 0 ? parseFloat(((netIncomeK / (shareCapital / 0.1))).toFixed(2)) : 0;

      reports[y] = {
        year: y,
        isYTD: isCurrentYTD,
        opDays,
        asOfDateStr: isCurrentYTD ? dateCtx.todayStr : `${y}/12/31`,
        milestone: h,
        kpis: {
          annualTrips,
          avgDailyTrips: Math.round(annualTrips / Math.max(1, opDays)),
          avgFareFWC: annualTrips > 0 ? parseFloat(((totalPassengerRevK * 1000) / annualTrips).toFixed(3)) : 0,
          ebitdaK: operatingIncomeK + costDepK,
          grossMarginPct: totalRevenueK > 0 ? parseFloat(((grossProfitK / totalRevenueK) * 100).toFixed(1)) : 0,
          opMarginPct: totalRevenueK > 0 ? parseFloat(((operatingIncomeK / totalRevenueK) * 100).toFixed(1)) : 0,
          netMarginPct: totalRevenueK > 0 ? parseFloat(((netIncomeK / totalRevenueK) * 100).toFixed(1)) : 0,
          fareboxRecoveryPct: (totalCostK + totalOpexK) > 0 ? parseFloat(((totalPassengerRevK / (totalCostK + totalOpexK)) * 100).toFixed(1)) : 0,
          debtRatioPct: totalAssetsK > 0 ? parseFloat(((totalLiabK / totalAssetsK) * 100).toFixed(1)) : 0,
          roePct: totalEquityK > 0 ? parseFloat(((netIncomeK / totalEquityK) * 100).toFixed(1)) : 0,
          epsFWC
        },
        incomeStatement: {
          revSingleAndICK,
          revBusinessK,
          revRegularPassK,
          revHolidayPkgK,
          revLuggageK,
          totalPassengerRevK,
          revRetailLeaseK,
          revAdsAndAirportK,
          totalAncillaryRevK,
          totalRevenueK,
          costLaborK,
          costPowerK,
          costMaintK,
          costDepK,
          totalCostK,
          grossProfitK,
          opexAdminK,
          opexMarketingK,
          opexComplianceK,
          totalOpexK,
          operatingIncomeK,
          nonOpSubsidyAndInterestK,
          interestExpK,
          assetDisposalLossK,
          nonOpNetK,
          ebtK,
          incomeTaxK,
          netIncomeK
        },
        balanceSheet: {
          cashK: cash,
          arK: ar,
          inventoryK: inventory,
          currentAssetsK,
          ppeGrossK: ppeGross,
          accumDepK: accumDep,
          netPPEK,
          rouAndIntangibleK: rouAndIntangible,
          nonCurrentAssetsK,
          totalAssetsK,
          apK: ap,
          unearnedRevK: unearnedRev,
          shortTermDebtK,
          currentLiabK,
          nonCurrentDebtK,
          greenBondsK: greenBonds,
          nonCurrentLiabK,
          totalLiabK,
          shareCapitalK: shareCapital,
          capitalSurplusK: capitalSurplus,
          retainedEarningsK: retainedEarnings,
          totalEquityK,
          totalLiabAndEquityK,
          balanced: totalAssetsK === totalLiabAndEquityK
        },
        cashFlow: {
          netIncomeK,
          addDepK: costDepK,
          addDisposalLossK: assetDisposalLossK,
          chgArK: -dAr,
          chgInvK: -dInv,
          chgApK: dAp,
          chgUnearnedK: dUnearned,
          ocfK,
          icfCapexK,
          icfIntangibleK,
          icfK,
          equityIssueK,
          debtDrawK,
          bondIssueK,
          debtRepayK: -debtRepayK,
          dividendsK: -dividendsK,
          fcfK,
          netCashChangeK,
          beginCashK,
          endCashK: cash,
          reconciled: cash === cash
        }
      };
    }

    _financialCache.set(cacheKey, reports);
    return reports;
  }

  // =========================================================
  // 11. 服務品質統計引擎 (2020 ~ 當日/新年度自動擴展)
  // =========================================================
  function generateServiceQualityStats(year = 2026, schedType = 'weekday', refDateInput) {
    const dateCtx = getReportingDateContext(refDateInput);
    const targetYear = Math.min(dateCtx.currentYear, Math.max(2020, parseInt(year, 10) || dateCtx.currentYear));
    const isYTD = (targetYear === dateCtx.currentYear);
    const maxMonth = isYTD ? dateCtx.currentMonth : 12;
    const opDays = isYTD
      ? dateCtx.dayOfYear
      : (targetYear === 2021 ? 306 : (isFlywanLeapYear(targetYear) ? 366 : 365));

    const rng = createRNG(`flywan-service-quality-${targetYear}-${schedType}`);
    const dayType = (schedType === 'holiday_long') ? 'holiday_long' :
                    (schedType === 'holiday') ? 'holiday' :
                    (schedType === 'weekday_to_long') ? 'weekday_to_long' :
                    (schedType === 'long_to_weekday') ? 'long_to_weekday' : 'weekday';

    const daySim = simulateDayOperations({
      schedType,
      dayType,
      year: targetYear,
      seedKey: `sq-${targetYear}-${schedType}`,
      collectSamples: false
    });

    // 隨營運年份演進，CBTC 與維修成熟度逐年提升準點率與可靠度
    const maturity = Math.min(1.0, Math.max(0.0, (targetYear - 2020) / 5.0));
    const baseOtp = 96.4 + maturity * 2.7; // 2020: ~96.4% -> 2025-2026+: ~99.1%+

    const otpByType = [
      { type: '普通車 (85M)', otpPct: parseFloat(randNormal(rng, baseOtp + 0.2, 0.15, 95.0, 99.8).toFixed(2)), avgDelaySec: Math.round(randNormal(rng, 22 - maturity * 9, 3, 8, 45)) },
      { type: '通勤車 (85M)', otpPct: parseFloat(randNormal(rng, baseOtp - 0.3, 0.20, 94.0, 99.6).toFixed(2)), avgDelaySec: Math.round(randNormal(rng, 28 - maturity * 10, 4, 10, 55)) },
      { type: '快速列車 (135M)', otpPct: parseFloat(randNormal(rng, baseOtp + 0.4, 0.12, 95.5, 99.9).toFixed(2)), avgDelaySec: Math.round(randNormal(rng, 18 - maturity * 7, 2.5, 6, 38)) },
      { type: '特快列車 (85M)', otpPct: parseFloat(randNormal(rng, baseOtp + 0.5, 0.12, 96.0, 99.9).toFixed(2)), avgDelaySec: Math.round(randNormal(rng, 14 - maturity * 6, 2.0, 5, 30)) }
    ];

    const overallOtpPct = parseFloat((otpByType.reduce((s, r) => s + r.otpPct, 0) / otpByType.length).toFixed(2));
    const scheduleFulfillmentPct = parseFloat(randNormal(rng, 99.5 + maturity * 0.42, 0.06, 98.8, 99.99).toFixed(2));
    const mdbfKm = Math.round(randNormal(rng, 145000 + maturity * 185000, 12000, 110000, 380000));
    const cbtcAvailPct = parseFloat(randNormal(rng, 99.72 + maturity * 0.24, 0.03, 99.4, 99.99).toFixed(3));

    // 月度準點率與滿意度趨勢 (若為當年度則只統計至本月)
    const monthlyTrend = [];
    for (let m = 1; m <= 12; m++) {
      const summerTyphoonDip = (m === 7 || m === 8) ? -0.35 : 0;
      const mOtp = parseFloat(randNormal(rng, overallOtpPct + summerTyphoonDip, 0.22, 95.0, 99.9).toFixed(2));
      const mSat = parseFloat(randNormal(rng, 87.5 + maturity * 5.8, 0.9, 82.0, 97.5).toFixed(1));
      if (m <= maxMonth) {
        monthlyTrend.push({
          month: m,
          isPartial: isYTD && m === maxMonth,
          otpPct: mOtp,
          satisfaction: mSat
        });
      }
    }

    // 區段尖峰最大乘車率分析 (依 6 大路廊區段，由當日實測列車停靠區段快照計算真實峰值)
    const corridorDefs = [
      { section: 'FR01 工業區 ↔ FR04 郵輪港', sMin: 0, sMax: 3, peakOrdPct: 0, peakBizPct: 0 },
      { section: 'FR04 郵輪港 ↔ FR08 飛灣新站', sMin: 3, sMax: 7, peakOrdPct: 0, peakBizPct: 0 },
      { section: 'FR08 飛灣新站 ↔ FR12 飛灣公園', sMin: 7, sMax: 11, peakOrdPct: 0, peakBizPct: 0 },
      { section: 'FR12 飛灣公園 ↔ FR16 飛灣機場', sMin: 11, sMax: 15, peakOrdPct: 0, peakBizPct: 0 },
      { section: 'FR16 飛灣機場 ↔ FR21 綾路北站', sMin: 15, sMax: 20, peakOrdPct: 0, peakBizPct: 0 },
      { section: 'FR21 綾路北站 ↔ FR22 全京大道', sMin: 20, sMax: 21, peakOrdPct: 0, peakBizPct: 0 }
    ];
    if (daySim && daySim.trainLookup) {
      for (const [uid, info] of daySim.trainLookup.entries()) {
        const snaps = info && info.snapshots;
        if (!snaps || snaps.length < 2) continue;
        const isDown = String(uid).startsWith('down-');
        for (let i = 0; i < snaps.length - 1; i++) {
          const sn = snaps[i];
          const nx = snaps[i + 1];
          const lo = Math.min(sn.stationIdx, nx.stationIdx);
          const hi = Math.max(sn.stationIdx, nx.stationIdx);
          for (const c of corridorDefs) {
            const overlaps = isDown
              ? (lo < c.sMax && hi > c.sMin)
              : (hi > c.sMin && lo < c.sMax);
            if (overlaps) {
              if ((sn.loadPctOrd || 0) > c.peakOrdPct) c.peakOrdPct = sn.loadPctOrd || 0;
              if ((sn.loadPctBiz || 0) > c.peakBizPct) c.peakBizPct = sn.loadPctBiz || 0;
            }
          }
        }
      }
    }
    const corridorSections = corridorDefs.map(c => ({
      section: c.section,
      peakOrdPct: Math.min(175, Math.round(c.peakOrdPct)),
      peakBizPct: Math.min(100, Math.round(c.peakBizPct))
    }));

    const satisfactionSurvey = [
      { metric: '行車安全與CBTC穩定度', score: parseFloat(randNormal(rng, 92.2 + maturity * 4.2, 0.7, 85, 99).toFixed(1)) },
      { metric: '列車準點與班距滿意度', score: parseFloat(randNormal(rng, 89.5 + maturity * 5.0, 0.9, 82, 98).toFixed(1)) },
      { metric: '車廂清潔與空調舒適度', score: parseFloat(randNormal(rng, 88.8 + maturity * 4.0, 1.0, 82, 97).toFixed(1)) },
      { metric: '尖峰擁擠緩解與引導',   score: parseFloat(randNormal(rng, 81.2 + maturity * 4.5, 1.3, 72, 93).toFixed(1)) },
      { metric: '無障礙與轉乘接駁便利性', score: parseFloat(randNormal(rng, 87.0 + (targetYear >= 2024 ? 5.2 : 1.5), 1.0, 78, 97).toFixed(1)) },
      { metric: '票價與定期票優惠合理性', score: parseFloat(randNormal(rng, 86.4 + maturity * 2.5, 1.1, 78, 95).toFixed(1)) }
    ];

    const overallSatisfaction = parseFloat((satisfactionSurvey.reduce((s, x) => s + x.score, 0) / satisfactionSurvey.length).toFixed(1));
    const ytdOtpAvg = monthlyTrend.length > 0
      ? parseFloat((monthlyTrend.reduce((s, x) => s + x.otpPct, 0) / monthlyTrend.length).toFixed(2))
      : overallOtpPct;

    return {
      year: targetYear,
      isYTD,
      opDays,
      asOfDateStr: isYTD ? dateCtx.todayStr : `${targetYear}/12/31`,
      schedType,
      overallOtpPct: ytdOtpAvg,
      scheduleFulfillmentPct,
      mdbfKm,
      cbtcAvailPct,
      overallSatisfaction,
      otpByType,
      monthlyTrend,
      corridorSections,
      satisfactionSurvey,
      crowdDist: daySim.summary.crowdDist,
      stopSnapshotCount: daySim.summary.stopSnapshotCount,
      leftBehindCount: daySim.summary.totalLeftBehinds,
      leftBehindRatePct: daySim.summary.leftBehindRatePct,
      fallbackSharePct: daySim.summary.fallbackSharePct
    };
  }

  // 匯出全域物件
  global.FlywanSimEngine = {
    USD_PER_FWC,
    STATION_PROFILES,
    STATION_BY_NAME,
    STATION_BY_CODE,
    RAPID_STATIONS,
    TIME_SLOTS,
    hashSeed,
    createRNG,
    randNormal,
    isFlywanLeapYear,
    getFlywanFestival,
    convertDateToFlywanInfo,
    resolveDayContext,
    getReportingDateContext,
    calculateFareFWC,
    PASS_FARES_FWC,
    getTrainCapacitySpec,
    getCrowdLevelFromPct,
    getYearHistoryFactor,
    simulateDayOperations,
    simulatePeriodStats,
    computeLiveDaySim,
    getTrainLoadAtTime,
    normalizeTimetableSecs,
    buildAllFinancialReports,
    generateServiceQualityStats
  };
})(typeof window !== 'undefined' ? window : globalThis);
