import { Component, OnInit, inject, signal } from '@angular/core';
import { NgIf, NgFor, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { WeatherService } from './services/weather.service';

// فقط برای type ها (لود واقعی را داینامیک می‌کنیم)
type LeafletNS = typeof import('leaflet');

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule, HttpClientModule, DecimalPipe, DatePipe],
  templateUrl: './app.html',
  styles: [`
    .controls { display:flex; gap:.5rem; align-items:center; margin-bottom:1rem; }
    .controls input { width: 260px; }
    .error { color:#b91c1c; }
    .card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:1rem; }
    .card-header{ display:flex; justify-content:space-between; align-items:center; gap:1rem; }
    .aqi { color:#111; padding: .25rem .5rem; border-radius:999px; font-weight:700; }
    .now{ display:flex; gap:2rem; align-items:flex-start; }
    .temp .t{ font-size:2rem; font-weight:700; }
    .facts{ list-style:disc; padding-left:1.25rem; }
    .wind .arrow{ display:inline-block; margin:0 .35rem; width:0;height:0;
      border-left:6px solid transparent;border-right:6px solid transparent;
      border-bottom:10px solid #111; }
    .tabs nav{ display:flex; gap:.5rem; margin:.75rem 0 1rem; }
    .tabs nav button{ border:1px solid #e5e7eb; padding:.35rem .6rem; border-radius:8px; background:#fff; }
    .tabs nav button.active{ background:#111; color:#fff; }
    .hours,.days{ display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:.5rem; }
    .hour,.day{ border:1px solid #eee; border-radius:10px; padding:.5rem; text-align:center; }
    .map-wrap{ display:flex; flex-direction:column; gap:.5rem; }
    .map-toolbar{ display:flex; gap:.5rem; align-items:center; }
    .map{ height:420px; width:100%; border-radius:12px; border:1px solid #eee; }
    .assistant-log{ margin-top:1rem; }
    .assistant-log .you{ color:#2563eb; }
    .assistant-log .assistant{ color:#16a34a; }
  `]
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

  // Minute
  minuteLoaded = signal(false);

  // History (TimeMachine)
  historyDate: string = '';
  historyTime: string = '12:00';

  // Day Summary
  summaryDate: string = '';
  summaryTz: string = '';

  // Assistant
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
  next24() {
    return this.svc.onecall()?.hourly?.slice(0, 24) ?? [];
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

    this.svc.currentByName(city, this.units, this.lang).subscribe({
      next: w => {
        this.svc.current.set(w);
        this.svc.tzOffset.set(w?.timezone ?? 0);

        const lat = w?.coord?.lat, lon = w?.coord?.lon;
        if (lat != null && lon != null) {
          this.svc.airByCoords(lat, lon).subscribe({
            next: air => this.svc.aqi.set(air?.list?.[0]?.main?.aqi ?? null),
            error: () => {}
          });
          this.svc.oneCallByCoords(lat, lon, this.units, this.lang).subscribe({
            next: oc => { 
              this.svc.onecall.set(oc); 
              this.svc.tzOffset.set(oc?.timezone_offset ?? this.svc.tzOffset()); 
            },
            error: () => {}
          });
          if (this.tab === 'map') { this.ensureMap(lat, lon); }
        }
        this.svc.loading.set(false);
      },
      error: () => { this.svc.error.set('مشکل در دریافت اطلاعات'); this.svc.loading.set(false); }
    });

    this.svc.forecast5ByName(city, this.units, this.lang).subscribe({
      next: f => { this.svc.forecast.set(f); this.svc.tzOffset.set(f?.city?.timezone ?? this.svc.tzOffset()); },
      error: () => {}
    });

    // geocode hints
    this.svc.geocode(city).subscribe({
      next: h => this.hints = h || [],
      error: () => {}
    });
  }

  // --- Map
  async ensureMap(lat: number, lon: number) {
    if (!this.L) this.L = await import('leaflet');
    const L = this.L;
    if (!this.map) {
      this.map = L.map('map', { zoomControl: true }).setView([lat, lon], 9);
    } else {
      this.map.setView([lat, lon], this.map.getZoom() || 9);
    }
    if (this.tile) this.tile.remove();
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

  // --- New Features
  onOpenMinutely() {
    const c = this.svc.current();
    if (!c?.coord) return;
    this.tab = 'minutely';
    this.minuteLoaded.set(false);
    this.svc.loadMinute(c.coord.lat, c.coord.lon, this.units, this.lang).subscribe({
      next: oc => {
        this.svc.minute.set(oc?.minutely ?? null);
        if (oc?.timezone_offset != null) this.svc.tzOffset.set(oc.timezone_offset);
        this.minuteLoaded.set(true);
      },
      error: () => {}
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
