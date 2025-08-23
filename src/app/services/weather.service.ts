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
  forecast = signal<any | null>(null);
  aqi = signal<number | null>(null);
  tzOffset = signal<number>(0); // seconds

  // extras (همه رایگان/بدون One Call 3.0 ساخته می‌شوند یا اختیاری‌اند)
  onecall = signal<any | null>(null);      // اگر سرور OneCall جواب بده، می‌گیریم؛ وابسته نیستیم
  minute = signal<any[] | null>(null);     // فقط اگر OneCall باشد
  history = signal<any | null>(null);      // (اختیاری OneCall timemachine)
  daySummary = signal<any | null>(null);   // (اختیاری day_summary)
  overview = signal<string | null>(null);  // (اختیاری overview)

  // assistant (اختیاری)
  assistantSessionId = signal<string | null>(null);
  assistantLast = signal<string | null>(null);

  constructor(private http: HttpClient) {}

  // ---- Geocoding ----
  geocode(q: string) {
    const params = new HttpParams().set('q', q);
    return this.http.get<any[]>(`${this.base}/geocode`, { params });
  }
  reverse(lat: number, lon: number) {
    const params = new HttpParams().set('lat', lat).set('lon', lon);
    return this.http.get<any[]>(`${this.base}/reverse`, { params });
  }
  zip(zip: string) {
    const params = new HttpParams().set('zip', zip);
    return this.http.get<any>(`${this.base}/geo/zip`, { params });
  }

  // ---- Current / Forecast (FREE) ----
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

  // ---- Air Pollution (FREE) ----
  airByCoords(lat: number, lon: number) {
    const p = new HttpParams().set('lat', lat).set('lon', lon);
    return this.http.get<any>(`${this.base}/air`, { params: p });
  }
  airForecast(lat: number, lon: number) {
    const p = new HttpParams().set('lat', lat).set('lon', lon);
    return this.http.get<any>(`${this.base}/air/forecast`, { params: p });
  }
  airHistory(lat: number, lon: number, start: number, end: number) {
    let p = new HttpParams().set('lat', lat).set('lon', lon).set('start', start).set('end', end);
    return this.http.get<any>(`${this.base}/air/history`, { params: p });
  }

  // ---- Multi cities (FREE) ----
  groupByIds(idsCsv: string, units: Units, lang?: string) {
    let p = new HttpParams().set('ids', idsCsv).set('units', units);
    if (lang) p = p.set('lang', lang);
    return this.http.get<any>(`${this.base}/cities/group`, { params: p });
  }
  findNearby(lat: number, lon: number, cnt = 20, units: Units = 'metric', lang?: string) {
    let p = new HttpParams()
      .set('lat', lat).set('lon', lon).set('cnt', cnt)
      .set('units', units);
    if (lang) p = p.set('lang', lang);
    return this.http.get<any>(`${this.base}/cities/find`, { params: p });
  }
  boxCities(bbox: string, units: Units = 'metric', lang?: string) {
    let p = new HttpParams().set('bbox', bbox).set('units', units);
    if (lang) p = p.set('lang', lang);
    return this.http.get<any>(`${this.base}/cities/box`, { params: p });
  }

  // ---- Optional OneCall (اگه دسترسی داشتی) ----
  oneCallByCoords(lat: number, lon: number, units: Units, lang?: string, exclude = 'minutely') {
    let p = new HttpParams().set('lat', lat).set('lon', lon).set('units', units).set('exclude', exclude);
    if (lang) p = p.set('lang', lang);
    return this.http.get<any>(`${this.base}/onecall`, { params: p });
  }
  loadMinute(lat: number, lon: number, units: Units, lang?: string) {
    let p = new HttpParams().set('lat', lat).set('lon', lon).set('units', units);
    if (lang) p = p.set('lang', lang);
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

  // ---- Assistant (اختیاری) ----
  assistantStart(prompt: string) {
    return this.http.post<any>(`${this.base}/assistant/session`, { prompt });
  }
  assistantResume(sessionId: string, prompt: string) {
    return this.http.post<any>(`${this.base}/assistant/session/${sessionId}`, { prompt });
  }
}
