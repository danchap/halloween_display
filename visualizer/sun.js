// Where the sun is: azimuth and elevation for a date, time and place, by
// the NOAA solar position algorithm (Meeus), good to about 0.01 degree
// for this century. Pure functions, no rendering.

// The display's moment: noon, local clock time, on Halloween 2026. France
// is back on CET (UTC+1) from 25 October 2026.
export const HALLOWEEN_NOON = new Date('2026-10-31T12:00:00+01:00');

const DEG = Math.PI / 180;

// Azimuth (degrees clockwise from north) and elevation (degrees above the
// horizon, without refraction) of the sun at `date` (a Date, i.e. a UTC
// instant) seen from latitude `lat` and longitude `lon` (degrees, east
// positive).
export function solarPosition(date, lat, lon) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  const L0 = mod(280.46646 + T * (36000.76983 + 0.0003032 * T), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * DEG;
  const C = (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(Mr)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) + 0.000289 * Math.sin(3 * Mr);
  const omega = 125.04 - 1934.136 * T;
  const apparentLong = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * DEG);
  const declination = Math.asin(Math.sin(eps * DEG) * Math.sin(apparentLong * DEG));
  const y = Math.tan((eps / 2) * DEG) ** 2;
  const L0r = L0 * DEG;
  const equationOfTime = 4 / DEG * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr)); // minutes
  const minutesUtc = (jd + 0.5 - Math.floor(jd + 0.5)) * 1440;
  const trueSolarMinutes = mod(minutesUtc + equationOfTime + 4 * lon, 1440);
  let hourAngle = trueSolarMinutes / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;
  const latr = lat * DEG, har = hourAngle * DEG;
  const cosZenith = Math.sin(latr) * Math.sin(declination) + Math.cos(latr) * Math.cos(declination) * Math.cos(har);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  const elevation = 90 - zenith / DEG;
  let azimuth;
  if (Math.sin(zenith) < 1e-9) azimuth = 180;
  else {
    const cosAz = (Math.sin(latr) * Math.cos(zenith) - Math.sin(declination)) / (Math.cos(latr) * Math.sin(zenith));
    const az = Math.acos(Math.max(-1, Math.min(1, cosAz))) / DEG;
    azimuth = hourAngle > 0 ? mod(az + 180, 360) : mod(540 - az, 360);
  }
  return { azimuth, elevation, declination: declination / DEG, equationOfTime };
}

// Unit vector toward the sun as [east, up, north].
export function sunVector(date, lat, lon) {
  const { azimuth, elevation } = solarPosition(date, lat, lon);
  const a = azimuth * DEG, h = elevation * DEG;
  return [Math.sin(a) * Math.cos(h), Math.sin(h), Math.cos(a) * Math.cos(h)];
}

function mod(v, m) { return ((v % m) + m) % m; }
