import { ClockWidget } from "./ClockWidget.jsx";
import { GifWidget } from "./GifWidget.jsx";
import { IframeWidget } from "./IframeWidget.jsx";
import { WeatherWidget } from "./WeatherWidget.jsx";
import { StatsWidget } from "./StatsWidget.jsx";
export const WIDGET_REGISTRY = {
  clock:   { component: ClockWidget,   label: "Clock",        icon: "🕐", defaultSize: { w:4, h:2 } },
  gif:     { component: GifWidget,     label: "Image/GIF",    icon: "🖼️", defaultSize: { w:4, h:4 } },
  iframe:  { component: IframeWidget,  label: "Website",      icon: "🌐", defaultSize: { w:6, h:5 } },
  weather: { component: WeatherWidget, label: "Weather",      icon: "⛅", defaultSize: { w:4, h:3 } },
  stats:   { component: StatsWidget,   label: "System Stats", icon: "📊", defaultSize: { w:4, h:3 } },
};
export function resolveWidget(type) { return WIDGET_REGISTRY[type] ?? null; }
