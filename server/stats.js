// stats.js — lightweight system stats for the /api/stats endpoint
// Uses only Node built-ins, no extra dependencies

import { execFile } from "child_process";
import { cpus, totalmem, freemem, uptime } from "os";

function getCPU() {
  const cpuList = cpus();
  // Sample CPU usage over 100ms
  return new Promise((resolve) => {
    const start = cpuList.map(c => ({ ...c.times }));
    setTimeout(() => {
      const end = cpus();
      let totalIdle = 0, totalTick = 0;
      end.forEach((cpu, i) => {
        const s = start[i];
        const e = cpu.times;
        const idle = e.idle - s.idle;
        const total = Object.values(e).reduce((a, b) => a + b, 0) -
                      Object.values(s).reduce((a, b) => a + b, 0);
        totalIdle += idle;
        totalTick += total;
      });
      const used = 100 - Math.round((totalIdle / totalTick) * 100);
      resolve(Math.max(0, Math.min(100, used)));
    }, 100);
  });
}

export async function getStats() {
  const cpu = await getCPU();
  const total = totalmem();
  const free = freemem();
  const ram = Math.round(((total - free) / total) * 100);

  // Disk usage via df (Linux/macOS)
  const disk = await new Promise(resolve => {
    execFile("df", ["-k", "/"], { timeout: 2000 }, (err, stdout) => {
      if (err) return resolve(null);
      const lines = stdout.trim().split("\n");
      const parts = lines[1]?.split(/\s+/);
      if (!parts || parts.length < 5) return resolve(null);
      const used = parseInt(parts[2], 10);
      const total = parseInt(parts[1], 10);
      resolve(total > 0 ? Math.round((used / total) * 100) : null);
    });
  });

  return {
    cpu,
    ram,
    disk,
    uptime: Math.floor(uptime()),
    memTotal: Math.round(total / 1024 / 1024),
    memFree: Math.round(free / 1024 / 1024)
  };
}
