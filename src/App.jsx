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
  { code: "DED", name: "Eredivisie" },
  { code: "BSA", name: "Brazil Serie A" },
];

// ---------------------------------------------
// PREDICTION ENGINE
// ---------------------------------------------
function computeConfidence(homeTeam, awayTeam, standings) {
  const findTeam = (id) => standings.find((s) => s.team.id === id);
  const home = findTeam(homeTeam.id);
  const away = findTeam(awayTeam.id);

  if (!home || !away) {
    return {
      home: 33, draw: 34, away: 33, basis: "insufficient-data",
      over15: 50, over25: 50,
      homeScores: 50, awayScores: 50,
      dc: { homeDraw: 66, drawAway: 66, homeAway: 66 },
    };
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

  // --- Goals-based markets, from average goals scored/conceded per game ---
  const homeGFpg = home.goalsFor / Math.max(home.playedGames, 1);
  const homeGApg = home.goalsAgainst / Math.max(home.playedGames, 1);
  const awayGFpg = away.goalsFor / Math.max(away.playedGames, 1);
  const awayGApg = away.goalsAgainst / Math.max(away.playedGames, 1);

  const expectedHomeGoals = (homeGFpg + awayGApg) / 2;
  const expectedAwayGoals = (awayGFpg + homeGApg) / 2;
  const expectedTotalGoals = expectedHomeGoals + expectedAwayGoals;

  // Over 1.5 — most matches clear this, so curve sits higher and narrower
  const over15Raw = 50 + (expectedTotalGoals - 1.5) * 26;
  const over15 = Math.round(Math.min(Math.max(over15Raw, 30), 95));

  // Over 2.5 — the classic line, centered right on 2.5
  const over25Raw = 50 + (expectedTotalGoals - 2.5) * 22;
  const over25 = Math.round(Math.min(Math.max(over25Raw, 12), 88));

  // Team to score over 0.5 (i.e. scores at least once) — driven by that team's expected goals
  const homeScoresRaw = 50 + (expectedHomeGoals - 0.9) * 35;
  const homeScores = Math.round(Math.min(Math.max(homeScoresRaw, 25), 95));
  const awayScoresRaw = 50 + (expectedAwayGoals - 0.9) * 35;
  const awayScores = Math.round(Math.min(Math.max(awayScoresRaw, 25), 95));

  // Double chance — direct sums of the 1X2 read, capped just under 100
  const dc = {
    homeDraw: Math.min(home_pct + draw_pct, 97),
    drawAway: Math.min(draw_pct + away_pct, 97),
    homeAway: Math.min(home_pct + away_pct, 97),
  };

  return {
    home: home_pct,
    draw: draw_pct,
    away: away_pct,
    homePosition: home.position,
    awayPosition: away.position,
    over15,
    over25,
    homeScores,
    awayScores,
    dc,
    expectedTotalGoals: expectedTotalGoals.toFixed(1),
  };
}

function readLabel(pct) {
  if (pct >= 55) return { label: "Strong lean", tone: "strong" };
  if (pct >= 40) return { label: "Moderate lean", tone: "moderate" };
  return { label: "Weak lean", tone: "weak" };
} Now paste Part 2 right after what you just added (cursor should already be at the end — if not, tap at the very end of the pasted text first):
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
          <div className="market-label">Match result</div>
          <ConfidenceBar label="Home win" sublabel={match.homeTeam.shortName} pct={conf.home} accent="#C9A227" />
          <ConfidenceBar label="Draw" sublabel="Split outcome" pct={conf.draw} accent="#8A9490" />
          <ConfidenceBar label="Away win" sublabel={match.awayTeam.shortName} pct={conf.away} accent="#B4483C" />

          <div className="market-label">Goals{conf.expectedTotalGoals ? ` · ~${conf.expectedTotalGoals} expected` : ""}</div>
          <ConfidenceBar label="Over 1.5" sublabel="Combined goals" pct={conf.over15} accent="#C9A227" />
          <ConfidenceBar label="Over 2.5" sublabel="Combined goals" pct={conf.over25} accent="#C9A227" />

          <div className="market-label">Team to score (Over 0.5)</div>
          <ConfidenceBar label={`${match.homeTeam.shortName} to score`} sublabel="At least 1 goal" pct={conf.homeScores} accent="#C9A227" />
          <ConfidenceBar label={`${match.awayTeam.shortName} to score`} sublabel="At least 1 goal" pct={conf.awayScores} accent="#B4483C" />

          <div className="market-label">Double chance</div>
          <ConfidenceBar label="Home or Draw" sublabel="1X" pct={conf.dc.homeDraw} accent="#C9A227" />
          <ConfidenceBar label="Draw or Away" sublabel="X2" pct={conf.dc.drawAway} accent="#8A9490" />
          <ConfidenceBar label="Home or Away" sublabel="12" pct={conf.dc.homeAway} accent="#B4483C" />

          <div className="disclaimer">
            <AlertCircle size={13} />
            Read from league position and goal-scoring form. Not betting advice — verify against your own market before staking.
          </div>
        </div>
      )}

      <div className="expand-hint">{expanded ? "Tap to collapse" : "Tap for match read"}</div>
    </div>
  );
} // ---------------------------------------------
// MAIN APP
// ---------------------------------------------

export default function App() {
  const [competition, setCompetition] = useState("PL");
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [usingLastSeason, setUsingLastSeason] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUsingLastSeason(false);
    try {
      const [matchesRes, standingsRes] = await Promise.all([
        fetch(`${API_BASE}?competition=${competition}&type=matches`),
        fetch(`${API_BASE}?competition=${competition}&type=standings`),
      ]);

      const matchesJson = await matchesRes.json();
      let standingsJson = await standingsRes.json();

      if (matchesJson.error === "rate-limit" || standingsJson.error === "rate-limit") {
        throw new Error("rate-limit");
      }
      if (matchesJson.error) {
        throw new Error("fetch-failed");
      }

      let table = standingsJson.standings?.find((s) => s.type === "TOTAL")?.table || [];

      const noGamesPlayedYet = table.length > 0 && table.every((t) => t.playedGames === 0);
      if (table.length === 0 || noGamesPlayedYet) {
        const lastYear = new Date().getFullYear() - 1;
        const fallbackRes = await fetch(`${API_BASE}?competition=${competition}&type=standings&season=${lastYear}`);
        const fallbackJson = await fallbackRes.json();
        const fallbackTable = fallbackJson.standings?.find((s) => s.type === "TOTAL")?.table || [];
        if (fallbackTable.length > 0) {
          table = fallbackTable;
          setUsingLastSeason(true);
        }
      }

      setMatches((matchesJson.matches || []).slice(0, 30));
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
        {usingLastSeason && matches.length > 0 && (
          <div className="season-note">
            New season hasn't kicked off yet — reads are based on last season's final form.
          </div>
        )}

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
