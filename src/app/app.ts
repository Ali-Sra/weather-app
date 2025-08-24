// src/app/app.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WeatherService } from './services/weather.service';

// برای تایپ Leaflet (lazy import)
type LeafletNS = typeof import('leaflet');

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']   // استایل‌ها فقط اینجاست، هیچ styles: [...] این‌جا نداریم
})
export class App implements OnInit {
  svc = inject(WeatherService);

  query = 'Hamburg,DE';
  units: 'metric'|'imperial'|'standard' = 'metric';
  lang: string = 'en';
  tab: 'hourly'|'daily'|'alerts'|'map'|'minutely'|'history'|'summary'|'overview'|'assistant' = 'hourly';

  // autocomplete
  hints: any[] = [];

  // Leaflet
  L?: LeafletNS;
  map?: import('leaflet').Map;
  tile?: import('leaflet').TileLayer;
  layer = 'temp_new';
  readonly LAYERS = [
    { id:'temp_new',          label:'Temperature' },
    { id:'clouds_new',        label:'Clouds' },
    { id:'wind_new',          label:'Wind' },
    { id:'pressure_new',      label:'Pressure' },
    { id:'precipitation_new', label:'Precipitation' },
  ];

  // Minute (OneCall اختیاری)
  minuteLoaded = signal(false);

  // History / DaySummary (اختیاری)
  historyDate: string = '';
  historyTime: string = '12:00';
  summaryDate: string = '';
  summaryTz: string = '';

  // Assistant (اختیاری)
  assistantInput: string = '';
  assistantLog: { role: 'you'|'assistant', text: string }[] = [];

  ngOnInit() {
    this.search();
  }

  // --- Helpers
  unitSymbol() {
    return this.units === 'metric' ? '°C' : (this.units === 'imperial' ? '°F' : 'K');
  }
  aqiLabel(aqi: number) {
    return ['—', 'Good', 'Fair', 'Moderate', 'Poor', 'Very Poor'][aqi] ?? '—';
  }
  aqiColor(aqi: number) {
    switch (aqi) {
      case 1: return '#22c55e';
      case 2: return '#84cc16';
      case 3: return '#facc15';
      case 4: return '#f59e0b';
      case 5: return '#ef4444';
      default: return '#a3a3a3';
    }
  }
  windDeg() { return this.svc.current()?.wind?.deg ?? 0; }

  toCityDate(unixSec?: number) {
    if (!unixSec && unixSec !== 0) return null;
    const off = this.svc.tzOffset() || 0;
    return new Date((unixSec + off) * 1000);
  }

  // ساعت‌های آینده از forecast (FREE)
  hoursFromForecast() {
    const f = this.svc.forecast();
    if (!f?.list) return [];
    return f.list.slice(0, 8).map((x: any) => ({
      dt: x.dt,
      temp: x.main?.temp,
      wind_speed: x.wind?.speed,
      pop: x.pop,
      weather: x.weather
    }));
  }

  // تجمیع روزانه از forecast (FREE)
  dailyFromForecast() {
    const f = this.svc.forecast();
    if (!f?.list) return [];
    const byDay: Record<string, any[]> = {};
    const off = this.svc.tzOffset() || 0; // ثانیه
    for (const it of f.list) {
      const d = new Date((it.dt + off) * 1000);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
      (byDay[key] ||= []).push(it);
    }
    return Object.values(byDay).slice(0, 5).map(arr => {
      let min = Infinity, max = -Infinity, pop = 0;
      for (const x of arr) {
        const t = x.main?.temp;
        if (t < min) min = t;
        if (t > max) max = t;
        pop = Math.max(pop, x.pop ?? 0);
      }
      const off2 = this.svc.tzOffset() || 0;
      const atNoon = arr.find(x => {
        const h = new Date((x.dt + off2) * 1000).getUTCHours();
        return h === 12;
      }) || arr[Math.floor(arr.length/2)];
      const icon = atNoon?.weather?.[0]?.icon || '01d';
      return { dt: arr[0].dt, temp: { min, max }, pop, weather: [{ icon }] };
    });
  }

  // ---- Helper برای autocomplete شهر
  formatHint(h: any) {
    return [h.name, h.state, h.country].filter(x => !!x).join(', ');
  }

  // --- Actions
  search() {
    const city = this.query.trim();
    if (!city) return;
    this.svc.loading.set(true);
    this.svc.error.set(null);

    // Current (FREE)
    this.svc.currentByName(city, this.units, this.lang).subscribe({
      next: w => {
        this.svc.current.set(w);
        // برخی پاسخ‌ها timezone ندارند؛ بعداً از forecast هم ست می‌کنیم
        if (typeof w?.timezone === 'number') this.svc.tzOffset.set(w.timezone);

        const lat = w?.coord?.lat, lon = w?.coord?.lon;
        if (lat != null && lon != null) {
          // AQI (FREE)
          this.svc.airByCoords(lat, lon).subscribe({
            next: air => this.svc.aqi.set(air?.list?.[0]?.main?.aqi ?? null),
            error: () => {}
          });
          // Optional: OneCall اگر دسترسی بود
          this.svc.oneCallByCoords(lat, lon, this.units, this.lang).subscribe({
            next: oc => {
              this.svc.onecall.set(oc);
              if (typeof oc?.timezone_offset === 'number') this.svc.tzOffset.set(oc.timezone_offset);
            },
            error: () => { /* ignore - رایگان نیست */ }
          });
          // نقشه
          if (this.tab === 'map') { this.ensureMap(lat, lon); }
        }
        this.svc.loading.set(false);
      },
      error: () => { this.svc.error.set('مشکل در دریافت اطلاعات'); this.svc.loading.set(false); }
    });

    // Forecast (FREE)
    this.svc.forecast5ByName(city, this.units, this.lang).subscribe({
      next: f => {
        this.svc.forecast.set(f);
        const tz = f?.city?.timezone;
        if (typeof tz === 'number') this.svc.tzOffset.set(tz);
      },
      error: () => {}
    });

    // Geocode hints
    this.svc.geocode(city).subscribe({
      next: h => this.hints = h || [],
      error: () => {}
    });
  }

  // --- Map
  async ensureMap(lat: number, lon: number) {
    if (!this.L) this.L = await import('leaflet');
    const L = this.L!;
    if (!this.map) {
      this.map = L.map('map', { zoomControl: true }).setView([lat, lon], 9);
    } else {
      this.map.setView([lat, lon], this.map.getZoom() || 9);
    }
    if (this.tile) this.tile.remove();
    // NOTE: tile endpoint ممکنه در پلن رایگان محدود باشه
    this.tile = L.tileLayer(`/api/tiles/${this.layer}/{z}/{x}/{y}.png`, {
      attribution: '&copy; OpenWeather &copy; OpenStreetMap'
    }).addTo(this.map);
  }
  openMapTab() {
    this.tab = 'map';
    const c = this.svc.current();
    if (c?.coord) this.ensureMap(c.coord.lat, c.coord.lon);
  }
  onLayerChange() {
    const c = this.svc.current();
    if (this.tab === 'map' && c?.coord) this.ensureMap(c.coord.lat, c.coord.lon);
  }

  // --- Optional features (OneCall/AI)
  onOpenMinutely() {
    const c = this.svc.current();
    if (!c?.coord) return;
    this.tab = 'minutely';
    this.minuteLoaded.set(false);
    this.svc.loadMinute(c.coord.lat, c.coord.lon, this.units, this.lang).subscribe({
      next: oc => {
        this.svc.minute.set(oc?.minutely ?? null);
        if (typeof oc?.timezone_offset === 'number') this.svc.tzOffset.set(oc.timezone_offset);
        this.minuteLoaded.set(true);
      },
      error: () => { this.minuteLoaded.set(true); }
    });
  }

  onLoadHistory() {
    const c = this.svc.current();
    if (!c?.coord || !this.historyDate) return;
    this.tab = 'history';
    const dtUnix = Math.floor(new Date(`${this.historyDate}T${this.historyTime || '12:00'}:00Z`).getTime() / 1000);
    this.svc.timeMachine(c.coord.lat, c.coord.lon, dtUnix, this.units, this.lang).subscribe({
      next: data => this.svc.history.set(data),
      error: () => {}
    });
  }

  onLoadDaySummary() {
    const c = this.svc.current();
    if (!c?.coord || !this.summaryDate) return;
    this.tab = 'summary';
    this.svc.getDaySummary(c.coord.lat, c.coord.lon, this.summaryDate, {
      tz: this.summaryTz || undefined,
      units: this.units,
      lang: this.lang
    }).subscribe({
      next: d => this.svc.daySummary.set(d),
      error: () => {}
    });
  }

  onLoadOverview() {
    const c = this.svc.current();
    if (!c?.coord) return;
    this.tab = 'overview';
    this.svc.getOverview(c.coord.lat, c.coord.lon, { units: this.units }).subscribe({
      next: d => this.svc.overview.set(d?.weather_overview ?? null),
      error: () => {}
    });
  }

  onAssistantSend() {
    const text = (this.assistantInput || '').trim();
    if (!text) return;
    const sid = this.svc.assistantSessionId();
    this.assistantLog.push({ role: 'you', text });
    this.assistantInput = '';
    if (!sid) {
      this.svc.assistantStart(text).subscribe({
        next: r => {
          this.svc.assistantSessionId.set(r?.session_id || null);
          if (r?.answer) {
            this.svc.assistantLast.set(r.answer);
            this.assistantLog.push({ role: 'assistant', text: r.answer });
          }
        },
        error: () => {}
      });
    } else {
      this.svc.assistantResume(sid, text).subscribe({
        next: r => {
          if (r?.answer) {
            this.svc.assistantLast.set(r.answer);
            this.assistantLog.push({ role: 'assistant', text: r.answer });
          }
        },
        error: () => {}
      });
    }
  }

  // دکمه‌ها
  openOverviewTab() { this.onLoadOverview(); }
  openSummaryTab()  { this.tab = 'summary'; }
  openHistoryTab()  { this.tab = 'history'; }
  openAssistantTab(){ this.tab = 'assistant'; }
}
