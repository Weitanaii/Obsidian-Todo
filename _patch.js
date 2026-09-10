const fs = require('fs');
const p = String.raw + "" + @"D:\0. 我的资料\0.项目\1. obsidian todo\Obsidian-Todo\src\settings.ts + "" + @";
let c = fs.readFileSync(p, 'utf8');
const s = '  activePlanKind: null,\n};';
const r = '  activePlanKind: null,\n  birthday: "",\n};';
if (!c.includes(s)) { console.log('MISS: defaults'); process.exit(1); }
c = c.replace(s, r);
fs.writeFileSync(p, c, 'utf8');
console.log('OK: default birthday added');
