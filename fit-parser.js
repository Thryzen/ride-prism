(function (root) {
  'use strict';
  const l10n=(s,...values)=>{const t=v=>typeof I18n==='undefined'?v:I18n.t(v);return Array.isArray(s)?s.reduce((out,part,i)=>out+t(part)+(i<values.length?values[i]:''),''):t(s);};
  const epoch = Date.UTC(1989, 11, 31) / 1000;
  const types = {
    0: [1, 'getUint8', 255], 1: [1, 'getInt8', 127], 2: [1, 'getUint8', 255],
    3: [2, 'getInt16', 32767], 4: [2, 'getUint16', 65535], 5: [4, 'getInt32', 2147483647],
    6: [4, 'getUint32', 4294967295], 8: [4, 'getFloat32', null], 9: [8, 'getFloat64', null],
    10: [1, 'getUint8', 0], 11: [2, 'getUint16', 0], 12: [4, 'getUint32', 0],
    13: [1, 'getUint8', 255], 14: [8, 'getBigInt64', 9223372036854775807n],
    15: [8, 'getBigUint64', 18446744073709551615n], 16: [8, 'getBigUint64', 0n]
  };
  function crc(bytes) {
    let value = 0;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (value >>> 1) ^ 0xA001 : value >>> 1;
    }
    return value;
  }
  function parse(buffer) {
    const view = new DataView(buffer), bytes = new Uint8Array(buffer);
    const warnings = [];
    if (bytes.length < 12) throw new Error(l10n('文件过短，不是有效的 FIT 文件。'));
    const headerSize = bytes[0];
    if (headerSize < 12 || headerSize > bytes.length || String.fromCharCode(...bytes.slice(8, 12)) !== '.FIT') throw new Error(l10n('未找到有效的 FIT 文件头。'));
    const length = view.getUint32(4, true), end = headerSize + length;
    if (end > bytes.length) throw new Error(l10n('FIT 数据不完整：文件可能被截断。'));
    if (headerSize >= 14 && view.getUint16(headerSize - 2, true) !== 0 && crc(bytes.slice(0, headerSize)) !== 0) warnings.push(l10n('文件头 CRC 校验不一致。'));
    if (bytes.length >= end + 2) {
      if (crc(bytes.slice(0, end + 2)) !== 0) warnings.push(l10n('文件 CRC 校验不一致，数据可能损坏。'));
    } else warnings.push(l10n('文件缺少尾部 CRC 校验值。'));
    let pos = headerSize, lastTime = null;
    const definitions = new Map(), records = [], sessions = [], laps = [], events = [], devices = [], fileIds = [];
    const counts = {};
    function ensure(size) { if (pos + size > end) throw new Error(l10n('数据消息越界，FIT 文件可能损坏。')); }
    function read(field, little) {
      ensure(field.size);
      let value;
      const type = field.type & 31, spec = types[type];
      if (type === 7) {
        value = new TextDecoder().decode(bytes.slice(pos, pos + field.size)).split('\0')[0];
      } else if (spec) {
        const [size, getter, invalid] = spec;
        if (field.size % size) throw new Error(l10n('FIT 字段长度与数据类型不匹配。'));
        const values = [];
        for (let offset = 0; offset < field.size; offset += size) {
          const raw = view[getter](pos + offset, little);
          const floatInvalid = type === 8 || type === 9;
          const invalidFloatBits = floatInvalid && bytes.slice(pos + offset, pos + offset + size).every(b => b === 255);
          values.push(raw === invalid || invalidFloatBits || (typeof raw === 'number' && !Number.isFinite(raw)) ? null : typeof raw === 'bigint' ? raw.toString() : raw);
        }
        value = values.length === 1 ? values[0] : values;
      } else value = Array.from(bytes.slice(pos, pos + field.size));
      pos += field.size;
      return value;
    }
    while (pos < end) {
      ensure(1);
      const header = bytes[pos++], compressed = !!(header & 128);
      const local = compressed ? (header >> 5) & 3 : header & 15;
      if (!compressed && (header & 64)) {
        ensure(5);
        pos++; const architecture = bytes[pos++];
        if (architecture !== 0 && architecture !== 1) throw new Error(l10n('FIT 定义消息的字节序无效。'));
        const little = architecture === 0, global = view.getUint16(pos, little); pos += 2;
        const count = bytes[pos++], fields = [];
        ensure(count * 3);
        for (let i = 0; i < count; i++) { fields.push({number: bytes[pos], size: bytes[pos + 1], type: bytes[pos + 2]}); pos += 3; }
        const developer = [];
        if (header & 32) {
          ensure(1); const countDev = bytes[pos++]; ensure(countDev * 3);
          for (let i = 0; i < countDev; i++) { developer.push({size: bytes[pos + 1]}); pos += 3; }
        }
        definitions.set(local, {little, global, fields, developer});
        continue;
      }
      const def = definitions.get(local);
      if (!def) throw new Error(l10n('数据消息缺少对应的 FIT 定义。'));
      const fields = {};
      for (const field of def.fields) {
        // A compressed timestamp header replaces the timestamp field's bytes.
        if (compressed && field.number === 253) continue;
        fields[field.number] = read(field, def.little);
      }
      for (const field of def.developer) { ensure(field.size); pos += field.size; }
      if (compressed) {
        if (lastTime === null) throw new Error(l10n('压缩时间戳缺少基准时间。'));
        let time = Math.floor(lastTime / 32) * 32 + (header & 31);
        if (time < lastTime) time += 32;
        fields[253] = time;
      }
      if (typeof fields[253] === 'number') lastTime = fields[253];
      counts[def.global] = (counts[def.global] || 0) + 1;
      const scaled = (n, scale = 1, offset = 0) => typeof fields[n] === 'number' ? fields[n] / scale - offset : null;
      const timestamp = typeof fields[253] === 'number' ? (fields[253] + epoch) * 1000 : null;
      const string = n => typeof fields[n] === 'string' ? fields[n].trim() || null : null;
      if (def.global === 0) fileIds.push({manufacturer:scaled(1),product:scaled(2),serialNumber:scaled(3),productName:string(8),fileType:scaled(0),timeCreated:typeof fields[4]==='number'?(fields[4]+epoch)*1000:null});
      if (def.global === 23) devices.push({timestamp,deviceIndex:scaled(0),deviceType:scaled(1),manufacturer:scaled(2),serialNumber:scaled(3),product:scaled(4),softwareVersion:scaled(5,100),hardwareVersion:scaled(6),operatingTime:scaled(7),batteryVoltage:scaled(10,256),batteryStatus:scaled(11),descriptor:string(19),antTransmissionType:scaled(20),antDeviceNumber:scaled(21),antNetwork:scaled(22),sourceType:scaled(25),productName:string(27),batteryLevel:scaled(32)});
      if (def.global === 20) records.push({
        timestamp, latitude: scaled(0, 2147483648 / 180), longitude: scaled(1, 2147483648 / 180),
        altitude: scaled(78, 5, 500) ?? scaled(2, 5, 500), heartRate: scaled(3), cadence: scaled(4),
        distance: scaled(5, 100), speed: scaled(73, 1000) ?? scaled(6, 1000), power: scaled(7), temperature: scaled(13)
      });
      if (def.global === 18 || def.global === 19) {
        const session = def.global === 18;
        const item = {timestamp, startTime: typeof fields[2] === 'number' ? (fields[2] + epoch) * 1000 : null,
          elapsed: scaled(7, 1000), timer: scaled(8, 1000), distance: scaled(9, 100),
          calories: scaled(11), avgSpeed: scaled(session ? 124 : 110, 1000) ?? scaled(session ? 14 : 13, 1000),
          maxSpeed: scaled(session ? 125 : 111, 1000) ?? scaled(session ? 15 : 14, 1000),
          minAltitude: scaled(session ? 127 : 113, 5, 500) ?? scaled(session ? 71 : 62, 5, 500),
          maxAltitude: scaled(session ? 128 : 114, 5, 500) ?? scaled(session ? 50 : 43, 5, 500),
          avgHeartRate: scaled(session ? 16 : 15), avgCadence: scaled(session ? 18 : 17), avgPower: scaled(session ? 20 : 19),
          maxHeartRate: scaled(session ? 17 : 16), maxCadence: scaled(session ? 19 : 18), maxPower: scaled(session ? 21 : 20),
          avgTemperature: scaled(session ? 57 : 50), maxTemperature: scaled(session ? 58 : 51),
          sport: session ? scaled(5) : null, subSport: session ? scaled(6) : null, ascent: scaled(session ? 22 : 21), descent: scaled(session ? 23 : 22)};
        (session ? sessions : laps).push(item);
      }
      if (def.global === 21) events.push({timestamp, event: fields[0], eventType: fields[1]});
    }
    if (!records.length) warnings.push(l10n('没有逐点活动记录；此文件可能是训练计划、设备设置或仅含摘要。'));
    return {records, sessions, laps, events, devices, fileIds, counts, warnings};
  }
  const api = {parse, crc};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FitParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
