import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertCircle, Radio, Minus } from "lucide-react";

// ---------------------------------------------
// CONFIG
// ---------------------------------------------
// No API key here anymore — it lives safely on the server
// (in Vercel's environment variables). This app talks to
// our own "/api/football" receptionist instead.
const API_BASE = "/api/football";

const COMPETITIONS = [
  { code: "PL", name: "Premier League" },
  { code: "PD", name: "La Liga" },
  { code: "SA", name: "Serie A" },
  { code: "BL1", name: "Bundesliga" },
  { code: "FL1", name: "Ligue 1" },
  { code: "CL", name: "Champions League" },
];

// ---------------------------------------------
// PREDICTION ENGINE
// ---------------------------------------------
function computeConfidence(homeTeam, awayTeam, standings) {
  const findTeam = (id) => standings.find((s) => s.team.id === id);
  const home = findTeam(homeTeam.id);
  const away = findTeam(awayTeam.id);

  if (!home || !away) {
    return { home: 33, draw: 34, away: 33, basis: "insufficient-data" };
  }

  const totalTeams = standings.length;
  const homeStrength = (totalTeams - home.position + 1) / totalTeams;
  const awayStrength = (totalTeams - away.position + 1) / totalTeams;

  const homeGDpg = home.goalDifference / Math.max(home.playedGames, 1);
  const awayGDpg = away.goalDifference / Math.max(away.playedGames, 1);

  const homeAdvantage = 0.12;

  let homeScore = homeStrength * 0.6 + Math.max(homeGDpg, -2) / 4 * 0.4 + homeAdvantage;
  let awayScore = awayStrength * 0.6 + Math.max(awayGDpg, -2) / 4 * 0.4;

  homeScore = Math.max(homeScore, 0.05);
  awayScore = Math.max(awayScore, 0.05);

  const gap = Math.abs(homeScore - awayScore);
  const drawBase = 0.32 - gap * 0.15;
  const drawScore = Math.max(drawBase, 0.12);

  const total = homeScore + awayScore + drawScore;
  const home_pct = Math.round((homeScore / total) * 100);
  const away_pct = Math.round((awayScore / total) * 100);
  const draw_pct = 100 - home_pct - away_pct;

  return {
    home: home_pct,
    draw: draw_pct,
    away: away_pct,
    homePosition: home.position,
    awayPosition: away.position,
  };
}

function readLabel(pct) {
  if (pct >= 55) return { label: "Strong lean", tone: "strong" };
  if (pct >= 40) return { label: "Moderate lean", tone: "moderate" };
  return { label: "Weak lean", tone: "weak" };
}

// ---------------------------------------------
// UI PRIMITIVES
// ---------------------------------------------

function ConfidenceBar({ label, sublabel, pct, accent }) {
  const read = readLabel(pct);
  return (
    <div className="conf-row">
      <div className="conf-row-head">
        <span className="conf-label">{label}</span>
        <span className="conf-pct" style={{ color: accent }}>
          {pct}%
        </span>
      </div>
      <div className="conf-track">
        <div className="conf-fill" style={{ width: `${pct}%`, background: accent }} />
        <div className="conf-ticks">
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((t) => (
            <div key={t} className="tick" style={{ left: `${t}%` }} />
          ))}
        </div>
      </div>
      <div className="conf-sub">
        {sublabel} · <span className={`read-tag read-${read.tone}`}>{read.label}</span>
      </div>
    </div>
  );
}

function MatchCard({ match, standings }) {
  const [expanded, setExpanded] = useState(false);
  const conf = standings
    ? computeConfidence(match.homeTeam, match.awayTeam, standings)
    : null;

  const date = new Date(match.utcDate);
  const dateStr = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="match-card" onClick={() => setExpanded((e) => !e)}>
      <div className="match-top">
        <span className="match-date">{dateStr} · {timeStr}</span>
        <span className={`match-status status-${match.status.toLowerCase()}`}>
          {match.status === "TIMED" ? "Upcoming" : match.status}
        </span>
      </div>

      <div className="match-teams">
        <div className="team">
          <span className="team-name">{match.homeTeam.shortName || match.homeTeam.name}</span>
          {conf && <span className="team-pos">#{conf.homePosition}</span>}
        </div>
        <span className="vs">vs</span>
        <div className="team team-away">
          <span className="team-name">{match.awayTeam.shortName || match.awayTeam.name}</span>
          {conf && <span className="team-pos">#{conf.awayPosition}</span>}
        </div>
      </div>

      {expanded && conf && (
        <div className="match-detail">
          <div className="detail-divider" />
          <ConfidenceBar label="Home win" sublabel={match.homeTeam.shortName} pct={conf.home} accent="#C9A227" />
          <ConfidenceBar label="Draw" sublabel="Split outcome" pct={conf.draw} accent="#8A9490" />
          <ConfidenceBar label="Away win" sublabel={match.awayTeam.shortName} pct={conf.away} accent="#B4483C" />
          <div className="disclaimer">
            <AlertCircle size={13} />
            Read from league position and goal-difference form. Not betting advice — verify against your own market before staking.
          </div>
        </div>
      )}

      <div className="expand-hint">{expanded ? "Tap to collapse" : "Tap for match read"}</div>
    </div>
  );
}

// ---------------------------------------------
// MAIN APP
// ---------------------------------------------

export default function App() {
  const [competition, setCompetition] = useState("PL");
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [matchesRes, standingsRes] = await Promise.all([
        fetch(`${API_BASE}?competition=${competition}&type=matches`),
        fetch(`${API_BASE}?competition=${competition}&type=standings`),
      ]);

      const matchesJson = await matchesRes.json();
      const standingsJson = await standingsRes.json();

      if (matchesJson.error === "rate-limit" || standingsJson.error === "rate-limit") {
        throw new Error("rate-limit");
      }
      if (matchesJson.error || standingsJson.error) {
        throw new Error("fetch-failed");
      }

      const table = standingsJson.standings?.find((s) => s.type === "TOTAL")?.table || [];

      setMatches((matchesJson.matches || []).slice(0, 15));
      setStandings(table);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message === "rate-limit" ? "rate-limit" : "fetch-failed");
    } finally {
      setLoading(false);
    }
  }, [competition]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="app-root">
      <style>{STYLES}</style>

      <header className="app-header">
        <div className="header-top">
          <div className="brand">
            <Radio size={18} className="brand-icon" />
            <span className="brand-name">MATCH READ</span>
          </div>
          <button className="refresh-btn" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : ""} />
          </button>
        </div>
        <p className="tagline">Pre-match analysis from live league data — not tips, a read.</p>
      </header>

      <div className="comp-tabs">
        {COMPETITIONS.map((c) => (
          <button
            key={c.code}
            className={`comp-tab ${competition === c.code ? "active" : ""}`}
            onClick={() => setCompetition(c.code)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <main className="app-main">
        {loading && matches.length === 0 && (
          <div className="state-card">
            <RefreshCw size={20} className="spin" />
            <p>Pulling fixtures…</p>
          </div>
        )}

        {error === "rate-limit" && (
          <div className="state-card">
            <AlertCircle size={20} />
            <p>Free tier limit hit (10 requests/min). Wait a moment and refresh.</p>
          </div>
        )}

        {error === "fetch-failed" && (
          <div className="state-card">
            <AlertCircle size={20} />
            <p>Couldn't reach the server. Try refreshing in a moment.</p>
          </div>
        )}

        {!loading && !error && matches.length === 0 && (
          <div className="state-card">
            <Minus size={20} />
            <p>No scheduled fixtures found for this competition right now.</p>
          </div>
        )}

        {matches.length > 0 && (
          <div className="match-list">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} standings={standings} />
            ))}
          </div>
        )}
      </main>

      {lastUpdated && (
        <footer className="app-footer">
          Updated {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          {" · "}Free tier · 10 req/min
        </footer>
      )}
    </div>
  );
}

// ---------------------------------------------
// STYLES
// ---------------------------------------------
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500&display=swap');

* { box-sizing: border-box; }

.app-root {
  min-height: 100vh;
  background: #0D1210;
  color: #E8EDE9;
  font-family: 'Inter', sans-serif;
  padding-bottom: 40px;
}

.app-header {
  padding: 20px 18px 14px;
  border-bottom: 1px solid #1D2621;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-icon { color: #C9A227; }

.brand-name {
  font-family: 'Oswald', sans-serif;
  font-weight: 700;
  font-size: 20px;
  letter-spacing: 0.04em;
}

.refresh-btn {
  background: #171F1A;
  border: 1px solid #2A342E;
  color: #E8EDE9;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.refresh-btn:disabled { opacity: 0.5; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.tagline {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: #8A9490;
  font-family: 'IBM Plex Mono', monospace;
}

.comp-tabs {
  display: flex;
  gap: 6px;
  padding: 12px 16px;
  overflow-x: auto;
  border-bottom: 1px solid #1D2621;
}
.comp-tabs::-webkit-scrollbar { display: none; }

.comp-tab {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid #2A342E;
  color: #8A9490;
  padding: 7px 13px;
  border-radius: 20px;
  font-size: 12.5px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.comp-tab.active {
  background: #C9A227;
  border-color: #C9A227;
  color: #0D1210;
  font-weight: 600;
}

.app-main {
  padding: 16px;
}

.state-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #171F1A;
  border: 1px solid #2A342E;
  border-radius: 10px;
  padding: 16px;
  color: #8A9490;
  font-size: 13.5px;
  line-height: 1.5;
}
.state-card code {
  background: #0D1210;
  padding: 2px 5px;
  border-radius: 4px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: #C9A227;
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.match-card {
  background: #131A15;
  border: 1px solid #212B24;
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.match-card:active { border-color: #C9A227; }

.match-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.match-date {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: #6B7570;
  letter-spacing: 0.03em;
}

.match-status {
  font-size: 10px;
  font-family: 'IBM Plex Mono', monospace;
  padding: 2px 8px;
  border-radius: 10px;
  background: #1D2621;
  color: #8A9490;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.match-teams {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.team {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}
.team-away { align-items: flex-end; text-align: right; }

.team-name {
  font-family: 'Oswald', sans-serif;
  font-weight: 600;
  font-size: 16px;
}

.team-pos {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #6B7570;
}

.vs {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: #4A5450;
  padding: 0 10px;
}

.match-detail { margin-top: 6px; }

.detail-divider {
  height: 1px;
  background: #212B24;
  margin: 12px 0 14px;
}

.conf-row { margin-bottom: 14px; }
.conf-row:last-of-type { margin-bottom: 10px; }

.conf-row-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
}

.conf-label {
  font-size: 12.5px;
  font-weight: 500;
  color: #C7D0CB;
}

.conf-pct {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 500;
  font-size: 13px;
}

.conf-track {
  position: relative;
  height: 6px;
  background: #1D2621;
  border-radius: 3px;
  overflow: visible;
  margin-bottom: 4px;
}

.conf-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}

.conf-ticks {
  position: absolute;
  top: -2px;
  left: 0;
  right: 0;
  height: 10px;
}
.tick {
  position: absolute;
  width: 1px;
  height: 10px;
  background: rgba(232, 237, 233, 0.08);
}

.conf-sub {
  font-size: 10.5px;
  color: #6B7570;
  font-family: 'IBM Plex Mono', monospace;
}

.read-tag { font-weight: 500; }
.read-strong { color: #C9A227; }
.read-moderate { color: #8A9490; }
.read-weak { color: #6B7570; }

.disclaimer {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  font-size: 10.5px;
  color: #6B7570;
  line-height: 1.4;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #212B24;
}
.disclaimer svg { flex-shrink: 0; margin-top: 1px; }

.expand-hint {
  text-align: center;
  font-size: 10px;
  color: #4A5450;
  font-family: 'IBM Plex Mono', monospace;
  margin-top: 10px;
  letter-spacing: 0.04em;
}

.app-footer {
  text-align: center;
  font-size: 10.5px;
  color: #4A5450;
  font-family: 'IBM Plex Mono', monospace;
  padding-top: 20px;
}
`;
