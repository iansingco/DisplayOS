#pragma once
// protocol.h — DisplayOS serial protocol constants
// Bridge → Device: newline-delimited JSON, 115200 baud
//
// Inbound commands (cmd field):
//   init                      — request ready announcement
//   render  { widgets: [...] } — full redraw
//   clocksync { epoch: N }    — re-anchor clock without full redraw
//   clear                     — blank display
//   brightness { value: 0-100 }
//   sleep / wake
//
// Outbound events (event field):
//   ready { fw, caps[], display{w,h}, screenId? }
//   button { id, action: "press"|"hold"|"release", ms? }
//   encoder { delta }         — positive = CW, negative = CCW
//   sensor { type, value, unit? }
//     types: temperature, humidity, motion, light, co2
//
// Widget data shapes in render.widgets[]:
//   clock   { h, m, s, ampm, date, showSeconds, epoch, format24 }
//   stats   { cpu, ram, disk, uptime }
//   weather { temp, unit, code, wind, hum, city }
//   text    { body }

#define PROTOCOL_VERSION "1"
#define BAUD_RATE        115200
#define JSON_BUF_SIZE    2048
