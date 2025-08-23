import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

type Units = 'metric'|'imperial'|'standard';

@Injectable({ providedIn: 'root' })
export class WeatherService {
  // اگر proxy داری همین /api، اگر نداری http://localhost:3000/api
  private base = '/api';

  // app state
  loading = signal(false);
  error = signal<string | null>(null);

  // core data
  current = signal<any | null>(null);
  onecall = signal<any | null>(null);
  forecast = signal<any | null>(null);
  aqi = signal<number | null>(null);
  tzOffset = signal<number>(0); // seconds

  // extras
  minute = signal<any[] | null>(null);
  history = signal<any | null>(null);
  daySummary = signal<any | null>(null);
  overview = signal<string | null>(null);

  // assistant
  assistantSessionId = signal<string | null>(null);
  assistantLast = signal<string | null>(null);

  constructor(private http: HttpClient) {}

  // ---- Geocoding for autocomplete ----
  geocode(q: string) {
    const params = new HttpParams().set('q', q);
    return this.http.get<any[]>(`${this.base}/geocode`, { params });
  }
  reverse(lat: number, lon: number) {
    const params = new HttpParams().set('lat', lat).set('lon', lon);
    return this.http.get<any[]>(`${this.base}/reverse`, { params });
  }

  // ---- Current/Forecast ----
  currentByName(city: string, units: Units, lang?: string): Observable<any> {
    let p = new HttpParams().set('city', city).set('units', units);
    if (lang) p = p.set('lang', lang);
    return this.http.get<any>(`${this.base}/weather`, { params: p });
  }
  forecast5ByName(city: string, units: Units, lang?: string): Observable<any> {
    let p = new HttpParams().set('city', city).set('units', units);
    if (lang) p = p.set('lang', lang);
    return this.http.get<any>(`${this.base}/forecast5`, { params: p });
  }

  // ---- OneCall ----
  oneCallByCoords(lat: number, lon: number, units: Units, lang?: string, exclude = 'minutely') {
    let p = new HttpParams().set('lat', lat).set('lon', lon).set('units', units).set('exclude', exclude);
    if (lang) p = p.set('lang', lang);
    return this.http.get<any>(`${this.base}/onecall`, { params: p });
  }
  airByCoords(lat: number, lon: number) {
    const p = new HttpParams().set('lat', lat).set('lon', lon);
    return this.http.get<any>(`${this.base}/air`, { params: p });
  }

  // ---- extras ----
  loadMinute(lat: number, lon: number, units: Units, lang?: string) {
    let p = new HttpParams().set('lat', lat).set('lon', lon).set('units', units);
    if (lang) p = p.set('lang', lang);
    // exclude را خالی نمی‌گذاریم چون سرور اگر خالی باشد هم می‌سازد؛
    // ما minute را از پاسخ می‌خوانیم.
    return this.http.get<any>(`${this.base}/onecall`, { params: p });
  }
  timeMachine(lat: number, lon: number, dtUnix: number, units?: Units, lang?: string) {
    let p = new HttpParams().set('lat', lat).set('lon', lon).set('dt', dtUnix);
    if (units) p = p.set('units', units);
    if (lang)  p = p.set('lang', lang);
    return this.http.get<any>(`${this.base}/onecall/timemachine`, { params: p });
  }
  getDaySummary(lat: number, lon: number, dateISO: string, opts: { tz?: string, units?: Units, lang?: string } = {}) {
    let p = new HttpParams().set('lat', lat).set('lon', lon).set('date', dateISO);
    if (opts.tz)    p = p.set('tz', opts.tz);
    if (opts.units) p = p.set('units', opts.units);
    if (opts.lang)  p = p.set('lang', opts.lang);
    return this.http.get<any>(`${this.base}/onecall/day_summary`, { params: p });
  }
  getOverview(lat: number, lon: number, opts: { date?: string, units?: Units } = {}) {
    let p = new HttpParams().set('lat', lat).set('lon', lon);
    if (opts.date)  p = p.set('date', opts.date);
    if (opts.units) p = p.set('units', opts.units);
    return this.http.get<any>(`${this.base}/onecall/overview`, { params: p });
  }

  // ---- assistant ----
  assistantStart(prompt: string) {
    return this.http.post<any>(`${this.base}/assistant/session`, { prompt });
  }
  assistantResume(sessionId: string, prompt: string) {
    return this.http.post<any>(`${this.base}/assistant/session/${sessionId}`, { prompt });
  }
}
