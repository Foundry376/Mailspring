import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Printer,
  MapPin,
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
} from 'lucide-react';
import { useEvents, useCalendars, useExtract, useTheme, useViewState, ui } from '@mailspring/view';

// Each kind of plan gets a color, an emoji and the words that give it away. Order matters: the
// first match wins, so "West Park community meeting" is Neighborhood, not an outing.
const KINDS = [
  {
    id: 'books',
    label: 'Books & storytime',
    emoji: '📚',
    re: /story ?tim|storytine|librar|book ?(club|sale|fair|launch|truck|signing)|bookworm|mother goose|author/i,
  },
  {
    id: 'party',
    label: 'Parties & birthdays',
    emoji: '🎈',
    re: /\bb-?day\b|birthday|party|celebrat|shower\b/i,
  },
  {
    id: 'neighbors',
    label: 'Neighborhood',
    emoji: '🏡',
    re: /block party|neighbo|community|cookout|potluck|\bnna\b|fall fest|art crawl/i,
  },
  {
    id: 'outing',
    label: 'Outings & festivals',
    emoji: '🎡',
    re: /\bfair\b|festival|\bfest\b|trick.or.treat|santa|\bzoo\b|museum|children'?s theat|aquarium|pumpkin|picnic|parade|lawn session|open house|by the river/i,
  },
  {
    id: 'family',
    label: 'Family & visitors',
    emoji: '👵',
    re: /grand(ma|pa|parent|mother|father)|\bnana\b|granny|\baunt\b|\buncle\b|cousin|in-laws?|\bmom'?s\b|\bdad'?s\b|family|\bhere\b|visit/i,
  },
  {
    id: 'kids',
    label: 'Classes & school',
    emoji: '🎨',
    re: /day ?care|preschool|pre-?k\b|school|\bpta\b|swim|soccer|ballet|gymnastics|\bcamp\b|class\b|classes|lesson/i,
  },
  {
    id: 'checkup',
    label: 'Checkups',
    emoji: '🩺',
    // A bare "dr appt" is as likely an adult's; ages ("2 year appt") and pediatricians aren't.
    re: /pediatric|well.?child|\d+ ?(year|month|yr|mo) (appt|check)/i,
  },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));

// Never family plans, whatever else they mention.
const NOT_FAMILY =
  /\bflight\b|\bstay at\b|departure|arrival|\bsyncs?\b|stand-?up|1:1|interview|deadline|\bdue\b/i;

// The on-device model only reads events that describe themselves (invites, ticketed events):
// on a bare title like "Recurring Daily" it guesses. It must say yes before its category
// counts; measured on real calendars, the yes is reliable and the category alone is not.
const MIN_DESCRIPTION = 40;
const AI_KINDS = {
  'kids activity': 'kids',
  'storytime or books': 'books',
  'birthday or party': 'party',
  'neighborhood event': 'neighbors',
  'festival or outing': 'outing',
  'relatives visiting': 'family',
};
const SCHEMA = {
  familyPlan: {
    type: 'boolean',
    description:
      'true only if this is clearly an activity for children or the whole family: kids birthday parties, kids classes, playdates, storytime, school or daycare events, family gatherings, relatives visiting',
  },
  kind: {
    type: 'enum',
    values: Object.keys(AI_KINDS),
    description: 'what kind of family plan, if it is one',
  },
};
const INSTRUCTIONS =
  'Most calendar events are not family plans: work, meetings, lunches, errands, travel, hotel stays, holidays, ticketed adult events.';

const described = (e) => (e.description || '').replace(/\s+/g, ' ').trim().length > MIN_DESCRIPTION;

// Weather comes from open-meteo.com, which needs no key: the manifest lists its two hosts in
// `network`, and plain fetch() reaches them. Its forecast covers the past 92 days and the next
// 16, so days outside that window simply show no weather.
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const PAST_DAYS = 92;
const FORECAST_DAYS = 16;
const FAHRENHEIT = /-US$|-LR$|-MM$/.test(navigator.language);

// WMO weather codes, as open-meteo reports them.
function weatherIcon(code) {
  if (code === 0) return { Icon: Sun, label: 'Sunny' };
  if (code <= 2) return { Icon: CloudSun, label: 'Partly cloudy' };
  if (code === 3) return { Icon: Cloud, label: 'Cloudy' };
  if (code <= 48) return { Icon: CloudFog, label: 'Fog' };
  if (code <= 57) return { Icon: CloudDrizzle, label: 'Drizzle' };
  if (code <= 67 || (code >= 80 && code <= 82)) return { Icon: CloudRain, label: 'Rain' };
  if (code <= 77 || code === 85 || code === 86) return { Icon: CloudSnow, label: 'Snow' };
  return { Icon: CloudLightning, label: 'Thunderstorms' };
}

/** `{ 'YYYY-MM-DD': { max, code } }` for the place, over the forecast window. */
function useWeather(place) {
  const [days, setDays] = useState({});
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!place) return undefined;
    let cancelled = false;
    const params = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      daily: 'weather_code,temperature_2m_max',
      timezone: 'auto',
      past_days: PAST_DAYS,
      forecast_days: FORECAST_DAYS,
      temperature_unit: FAHRENHEIT ? 'fahrenheit' : 'celsius',
    });
    fetch(`${FORECAST_URL}?${params}`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`Weather unavailable (${r.status})`))
      )
      .then(({ daily }) => {
        if (cancelled) return;
        const out = {};
        daily.time.forEach((day, i) => {
          if (daily.temperature_2m_max[i] != null) {
            out[day] = {
              max: Math.round(daily.temperature_2m_max[i]),
              code: daily.weather_code[i],
            };
          }
        });
        setDays(out);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [place?.latitude, place?.longitude]);
  return { days, error };
}

function PlacePicker({ place, onChange }) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const search = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const r = await fetch(
        `${GEOCODE_URL}?${new URLSearchParams({ name: query.trim(), count: 1 })}`
      );
      const hit = (await r.json()).results?.[0];
      if (!hit) return setError(`Couldn't find "${query}"`);
      onChange({
        name: hit.name,
        region: hit.admin1 || hit.country,
        latitude: hit.latitude,
        longitude: hit.longitude,
      });
      setEditing(false);
      setError(null);
    } catch {
      setError('Weather is unavailable right now');
    }
  };
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex h-6 items-center gap-1 hover:text-ms-text"
      >
        <MapPin size={12} />
        {place ? `Weather for ${place.name}` : 'Add weather for your town'}
      </button>
    );
  }
  return (
    // The same height as the button it replaces, so opening it doesn't shift the header.
    <form onSubmit={search} className="flex h-6 items-center gap-1">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => !query && setEditing(false)}
        placeholder="Town or city"
        className="h-6 w-36 rounded-md border border-ms-border bg-ms-bg px-2 text-xs text-ms-text outline-none focus:border-ms-accent"
      />
      {error && <span className="text-ms-danger">{error}</span>}
    </form>
  );
}

function WeatherBadge({ weather }) {
  if (!weather) return null;
  const { Icon, label } = weatherIcon(weather.code);
  return (
    <span
      className="ml-auto flex shrink-0 items-center gap-0.5 text-[11px] text-ms-muted"
      title={label}
    >
      <Icon size={13} />
      {weather.max}°
    </span>
  );
}

// Printed for the fridge: one landscape sheet, light whatever the app theme, controls hidden.
// The page is 7.5in tall so it fits both Letter (7.8in) and A4 (7.57in) inside the margins.
// The ms-* colors are CSS variables, so redefining them for print restyles every class.
const PRINT_CSS = `
@page { size: landscape; margin: 0.35in; }
@media print {
  :root {
    --ms-bg: white;
    --ms-panel: rgb(247 246 243);
    --ms-text: rgb(28 28 28);
    --ms-heading: rgb(28 28 28);
    --ms-muted: rgb(105 105 105);
    --ms-border: rgb(215 215 215);
  }
  html, body { height: auto !important; background: white; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PER_DAY = 2;

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Only the weeks the month touches: five rows most months, six when it spills over, so the
// grid (and the printed sheet) never ends in a row of next month.
function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(year, month + 1, 0).getDate()) / 7);
  return Array.from(
    { length: weeks * 7 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
  );
}

function timeLabel(e) {
  if (e.isAllDay) return '';
  return new Date(e.start)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .replace(':00', '')
    .replace(' ', '')
    .toLowerCase();
}

function untilLabel(iso) {
  const days = Math.round(
    (new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5
  );
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `This ${new Date(iso).toLocaleDateString([], { weekday: 'long' })}`;
  return `In ${days} days`;
}

function tint(color, pct) {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

function Chip({ event, kind, color, compact, byAI }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        ui.showEvent(event.id);
      }}
      title={`${event.title}${event.location ? `\n${event.location}` : ''}${
        byAI ? '\nSpotted by on-device AI from the event details' : ''
      }`}
      className="flex w-full min-w-0 items-start gap-1 rounded-lg border-l-[3px] px-1.5 py-1 text-left leading-tight hover:brightness-95"
      style={{ background: tint(color, 16), borderColor: color }}
    >
      <span className="shrink-0 text-[13px]">{kind.emoji}</span>
      <span className="min-w-0">
        <span
          className={`block font-medium text-ms-text ${compact ? 'truncate text-[11px]' : 'line-clamp-2 text-xs'}`}
        >
          {byAI && <Sparkles size={10} className="mr-0.5 inline text-ms-accent" />}
          {event.title}
        </span>
        {timeLabel(event) && (
          <span className="block text-[10px] text-ms-muted">{timeLabel(event)}</span>
        )}
      </span>
    </button>
  );
}

export default function FamilyPlansView() {
  const theme = useTheme();
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDay, setSelectedDay] = useState(null);
  const [showOthers, setShowOthers] = useViewState('showOthers', false);
  const [place, setPlace] = useViewState('weatherPlace', null);
  const weather = useWeather(place);
  const [printError, setPrintError] = useState(null);
  const print = () =>
    ui.print({ landscape: true }).then(
      () => setPrintError(null),
      (err) => setPrintError(err.message)
    );

  const days = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  // Date-only strings keep the range, and so the subscriptions, identical across renders.
  const last = days[days.length - 1];
  const range = useMemo(
    () => ({
      start: dayKey(days[0]),
      end: dayKey(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)),
    }),
    [days]
  );
  const events = useEvents(range);
  const calendars = useCalendars();

  const holidayCalendars = useMemo(
    () => new Set(calendars.data.filter((c) => /holiday/i.test(c.name)).map((c) => c.id)),
    [calendars.data]
  );

  // Tier 1: keywords. Events they can't place go to the on-device model if they have a
  // description to read.
  const keyword = useMemo(() => {
    const out = {};
    for (const e of events.data) {
      if (out[e.eventId] !== undefined || holidayCalendars.has(e.calendarId)) continue;
      const text = `${e.title} ${e.location || ''}`;
      if (NOT_FAMILY.test(text)) out[e.eventId] = null;
      else {
        const kind = KINDS.find((k) => k.re.test(text));
        if (kind) out[e.eventId] = kind.id;
      }
    }
    return out;
  }, [events.data, holidayCalendars]);

  const misses = useMemo(
    () =>
      [...new Set(events.data.map((e) => e.eventId))].filter(
        (id) =>
          !(id in keyword) &&
          events.data.some(
            (e) => e.eventId === id && described(e) && !holidayCalendars.has(e.calendarId)
          )
      ),
    [events.data, keyword, holidayCalendars]
  );
  const ai = useExtract(
    misses.length
      ? { events: { ...range, eventIds: misses }, schema: SCHEMA, instructions: INSTRUCTIONS }
      : null
  );

  const kindOf = (e) => {
    if (e.eventId in keyword) return keyword[e.eventId];
    const answer = ai.results[e.eventId]?.value;
    return answer?.familyPlan ? AI_KINDS[answer.kind] || 'family' : null;
  };
  const colorOf = (kindId) =>
    theme.chart[KINDS.findIndex((k) => k.id === kindId) % theme.chart.length];

  const byDay = useMemo(() => {
    const out = {};
    for (const e of events.data) {
      const key = dayKey(new Date(e.isAllDay ? `${e.start.slice(0, 10)}T12:00:00` : e.start));
      const day = (out[key] ??= { family: [], holidays: [], others: [] });
      const kind = kindOf(e);
      if (holidayCalendars.has(e.calendarId)) {
        if (!day.holidays.includes(e.title)) day.holidays.push(e.title);
      } else if (kind) {
        day.family.push({ event: e, kind: KIND[kind], byAI: !(e.eventId in keyword) });
      } else day.others.push(e);
    }
    return out;
  }, [events.data, keyword, ai.results, holidayCalendars]);

  const inMonth = (d) => d.getMonth() === cursor.month;
  const monthPlans = days.filter(inMonth).flatMap((d) => byDay[dayKey(d)]?.family || []);
  const counts = KINDS.map((k) => ({
    kind: k,
    n: monthPlans.filter((p) => p.kind.id === k.id).length,
  })).filter((c) => c.n);
  const nextUp = monthPlans
    .filter((p) => new Date(p.event.end) >= today)
    .sort((a, b) => a.event.start.localeCompare(b.event.start))[0];

  const shift = (delta) => {
    setSelectedDay(null);
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };
  const monthName = new Date(cursor.year, cursor.month, 1).toLocaleDateString([], {
    month: 'long',
  });
  const sorting = ai.status === 'running';
  const modelOff = ai.modelStatus && ai.modelStatus !== 'ready';
  const selected = selectedDay && byDay[selectedDay];

  return (
    <div className="h-screen overflow-y-auto bg-ms-bg text-ms-text print:h-auto print:overflow-visible">
      <style>{PRINT_CSS}</style>
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6 pb-20 print:h-[7.5in] print:max-w-none print:gap-2 print:p-0">
        <header className="flex flex-wrap items-end gap-4 print:flex-nowrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ms-accent">
              Family plans
            </div>
            <h1 className="font-serif text-4xl font-semibold leading-tight">
              {monthName} <span className="font-normal text-ms-muted">{cursor.year}</span>
            </h1>
          </div>
          <div className="flex items-center gap-1 print:hidden">
            <button
              onClick={() => shift(-1)}
              className="rounded-full p-1.5 text-ms-muted hover:bg-ms-panel hover:text-ms-text"
              title="Previous month"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => {
                setSelectedDay(null);
                setCursor({ year: today.getFullYear(), month: today.getMonth() });
              }}
              className="rounded-full border border-ms-border px-3 py-1 text-xs hover:border-ms-accent"
            >
              Today
            </button>
            <button
              onClick={() => shift(1)}
              className="rounded-full p-1.5 text-ms-muted hover:bg-ms-panel hover:text-ms-text"
              title="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="ml-auto flex items-center gap-4 text-xs text-ms-muted print:hidden">
            <div className="flex flex-col items-end gap-1">
              <PlacePicker place={place} onChange={setPlace} />
              {weather.error && <span>{weather.error}</span>}
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showOthers}
                  onChange={(e) => setShowOthers(e.target.checked)}
                />
                Show everything else, faintly
              </label>
              {sorting && (
                <span className="flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> Looking through your calendar…{' '}
                  {ai.processed}/{ai.total}
                </span>
              )}
              {modelOff && !sorting && (
                <span>On-device AI is off, so only keyword matches are shown.</span>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={print}
                className="flex items-center gap-2 rounded-full bg-ms-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
              >
                <Printer size={16} /> Print for the fridge
              </button>
              {printError && <span className="text-ms-danger">{printError}</span>}
            </div>
          </div>
        </header>

        {nextUp && (
          <div
            className="flex items-center gap-4 rounded-2xl p-4 print:hidden"
            style={{ background: tint(colorOf(nextUp.kind.id), 14) }}
          >
            <div className="text-4xl">{nextUp.kind.emoji}</div>
            <div className="min-w-0 flex-1">
              <div
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: colorOf(nextUp.kind.id) }}
              >
                Next up · {untilLabel(nextUp.event.start)}
              </div>
              <button
                onClick={() => ui.showEvent(nextUp.event.id)}
                className="block truncate text-left font-serif text-xl font-semibold hover:underline"
              >
                {nextUp.event.title}
              </button>
              <div className="truncate text-sm text-ms-muted">
                {new Date(nextUp.event.start).toLocaleDateString([], {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
                {timeLabel(nextUp.event) && ` · ${timeLabel(nextUp.event)}`}
                {nextUp.event.location && ` · ${nextUp.event.location.split('\n')[0]}`}
              </div>
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-col print:flex-1">
          <div className="grid grid-cols-7 gap-2 pb-1">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="px-1 text-xs font-semibold uppercase tracking-wide text-ms-muted"
              >
                {d}
              </div>
            ))}
          </div>
          <div
            className={`grid grid-cols-7 gap-2 print:min-h-0 print:flex-1 print:gap-1.5 ${
              days.length > 35 ? 'print:grid-rows-6' : 'print:grid-rows-5'
            }`}
          >
            {days.map((d) => {
              const key = dayKey(d);
              const day = byDay[key] || { family: [], holidays: [], others: [] };
              const isToday = key === dayKey(today);
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              const extra = day.family.length - PER_DAY;
              return (
                <div
                  key={key}
                  onClick={() => setSelectedDay(selectedDay === key ? null : key)}
                  className={`flex aspect-square min-h-[96px] cursor-pointer print:aspect-auto print:min-h-0 print:break-inside-avoid flex-col gap-1 overflow-hidden rounded-2xl border p-2 transition ${
                    selectedDay === key
                      ? 'border-ms-accent'
                      : 'border-ms-border hover:border-ms-accent'
                  } ${weekend ? 'bg-ms-panel' : 'bg-ms-bg'} ${inMonth(d) ? '' : 'opacity-40'}`}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold ${
                        isToday
                          ? 'bg-ms-accent text-white'
                          : day.family.length
                            ? 'text-ms-text'
                            : 'text-ms-muted'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {day.holidays[0] && (
                      <span
                        className="truncate text-[10px] font-medium text-ms-accent"
                        title={day.holidays.join(', ')}
                      >
                        {day.holidays[0]}
                      </span>
                    )}
                    <WeatherBadge weather={weather.days[key]} />
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                    {day.family.slice(0, PER_DAY).map(({ event, kind, byAI }) => (
                      <Chip
                        key={event.id}
                        event={event}
                        kind={kind}
                        color={colorOf(kind.id)}
                        compact={day.family.length > 1}
                        byAI={byAI}
                      />
                    ))}
                    {showOthers &&
                      day.family.length < PER_DAY &&
                      day.others.slice(0, PER_DAY - day.family.length).map((e) => (
                        <div key={e.id} className="truncate text-[10px] text-ms-muted opacity-70">
                          {timeLabel(e) && `${timeLabel(e)} `}
                          {e.title}
                        </div>
                      ))}
                  </div>
                  {extra > 0 && (
                    <div className="text-[10px] font-medium text-ms-muted">+{extra} more</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {selected && (
          <div className="rounded-2xl border border-ms-border bg-ms-panel p-4 print:hidden">
            <div className="mb-2 font-serif text-lg font-semibold">
              {new Date(`${selectedDay}T12:00:00`).toLocaleDateString([], {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </div>
            {selected.family.length === 0 && (
              <div className="text-sm text-ms-muted">No family plans this day.</div>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {selected.family.map(({ event, kind, byAI }) => (
                <Chip
                  key={event.id}
                  event={event}
                  kind={kind}
                  color={colorOf(kind.id)}
                  byAI={byAI}
                />
              ))}
            </div>
            {selected.others.length > 0 && (
              <div className="mt-3 text-xs text-ms-muted">
                Also: {selected.others.map((e) => e.title).join(' · ')}
              </div>
            )}
          </div>
        )}

        <footer className="flex flex-wrap items-center gap-2 text-xs text-ms-muted print:text-[10px]">
          <Sparkles size={13} className="text-ms-accent" />
          {monthPlans.length
            ? `${monthPlans.length} family ${monthPlans.length === 1 ? 'plan' : 'plans'} in ${monthName}:`
            : events.loading
              ? 'Reading your calendar…'
              : `Nothing family-shaped on the calendar in ${monthName} yet.`}
          {counts.map(({ kind, n }) => (
            <span
              key={kind.id}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-ms-text"
              style={{ background: tint(colorOf(kind.id), 16) }}
            >
              {kind.emoji} {kind.label} <span className="text-ms-muted">{n}</span>
            </span>
          ))}
        </footer>
      </div>
    </div>
  );
}
