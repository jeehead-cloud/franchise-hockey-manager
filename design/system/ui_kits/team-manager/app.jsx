const { Button, IconButton, Input, Badge, Panel, StatMeter, StatusPill, Tooltip,
        StandingsTable, StatsTable, PlayerTable, PlayerCard, Bracket } = window.AtlasDesignSystem_b2128a;

function toKebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Za-z])([0-9])/g, "$1-$2").toLowerCase();
}
function Icon({ name, size = 16 }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = "";
      const i = document.createElement("i");
      i.setAttribute("data-lucide", toKebab(name));
      i.style.width = size + "px";
      i.style.height = size + "px";
      ref.current.appendChild(i);
      window.lucide.createIcons({ icons: window.lucide.icons, attrs: { width: size, height: size, "stroke-width": 1.75 }, root: ref.current });
    }
  }, [name, size]);
  return <span ref={ref} style={{ display: "inline-flex", color: "inherit" }} />;
}

const TEAM = "Ironclad HC";

const standings = [
  { team: "Ironclad HC", gp: 62, w: 41, l: 15, otl: 6, pts: 88, diff: 34 },
  { team: "Northgate Wolves", gp: 62, w: 37, l: 19, otl: 6, pts: 80, diff: 21 },
  { team: "Harbor City SC", gp: 62, w: 30, l: 24, otl: 8, pts: 68, diff: -4 },
  { team: "Summit Rangers", gp: 62, w: 28, l: 27, otl: 7, pts: 63, diff: -9 },
  { team: "Redline Athletic", gp: 62, w: 24, l: 31, otl: 7, pts: 55, diff: -22 },
];

const scorers = [
  { id: 1, name: "A. Kessler", gp: 62, g: 34, a: 41, pts: 75 },
  { id: 2, name: "M. Doyle", gp: 60, g: 29, a: 38, pts: 67 },
  { id: 3, name: "J. Farrow", gp: 58, g: 25, a: 30, pts: 55 },
];

const roster = [
  { id: 1, number: 17, name: "A. Kessler", pos: "C", age: 27, ovr: 87, status: "Healthy" },
  { id: 2, number: 4, name: "R. Novak", pos: "D", age: 31, ovr: 81, status: "Injured" },
  { id: 3, number: 29, name: "T. Whitfield", pos: "G", age: 24, ovr: 84, status: "Healthy" },
  { id: 4, number: 91, name: "M. Doyle", pos: "LW", age: 26, ovr: 85, status: "Healthy" },
  { id: 5, number: 8, name: "D. Aro", pos: "D", age: 29, ovr: 78, status: "Suspended" },
];

const bracketRounds = [
  { label: "Quarterfinal", matchups: [
    { top: { name: "Ironclad HC", score: 4, winner: true }, bottom: { name: "Northgate Wolves", score: 1 } },
    { top: { name: "Harbor City SC", score: 2 }, bottom: { name: "Summit Rangers", score: 3, winner: true } },
    { top: { name: "Redline Athletic", score: 1 }, bottom: { name: "Bay Union", score: 4, winner: true } },
    { top: { name: "Frost Valley", score: 3, winner: true }, bottom: { name: "Coastal FC", score: 0 } },
  ]},
  { label: "Semifinal", matchups: [
    { top: { name: "Ironclad HC", score: 3, winner: true }, bottom: { name: "Summit Rangers", score: 2 } },
    { top: { name: "Bay Union", score: 1 }, bottom: { name: "Frost Valley", score: 4, winner: true } },
  ]},
  { label: "Final", matchups: [
    { top: {}, bottom: {} },
  ]},
];

function Sidebar({ screen, setScreen }) {
  const items = [
    ["dashboard", "LayoutDashboard", "Dashboard"],
    ["standings", "ListOrdered", "Standings"],
    ["playoffs", "Trophy", "Playoffs"],
    ["player", "User", "Player Profile"],
  ];
  return (
    <div style={{ width: 220, flexShrink: 0, background: "var(--surface-panel)", borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
        <span style={{ font: "var(--text-brand)", color: "var(--text-primary)" }}>Atlas</span>
      </div>
      <div style={{ padding: "12px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>
        {items.map(([key, icon, label]) => (
          <div
            key={key}
            onClick={() => setScreen(key)}
            style={{
              display: "flex", alignItems: "center", gap: "10px", padding: "9px 10px",
              borderRadius: "var(--radius-sm)", cursor: "pointer",
              background: screen === key ? "var(--accent-primary-wash)" : "transparent",
              color: screen === key ? "var(--accent-primary)" : "var(--text-secondary)",
              font: screen === key ? "600 var(--text-size-sm)/1 var(--font-sans)" : "var(--text-body-sm)",
            }}
          >
            <Icon name={icon} size={16} />
            {label}
          </div>
        ))}
      </div>
      <div style={{ marginTop: "auto", padding: "16px", borderTop: "1px solid var(--border-subtle)" }}>
        <StatusPill tone="home" label={TEAM} />
      </div>
    </div>
  );
}

function TopBar({ title }) {
  return (
    <div style={{ height: "var(--toolbar-height)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-panel)" }}>
      <span style={{ font: "var(--text-heading-md)", color: "var(--text-primary)" }}>{title}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Input value="" onChange={() => {}} placeholder="Search players, teams..." icon={<Icon name="Search" size={14} />} style={{ width: 220 }} />
        <IconButton title="Notifications" icon={<Icon name="Bell" />} />
      </div>
    </div>
  );
}

function DashboardScreen() {
  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ background: "var(--gradient-team-hero)", borderRadius: "var(--radius-lg)", padding: "24px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ font: "var(--text-heading-lg)" }}>{TEAM}</div>
          <div style={{ font: "var(--text-body)", opacity: 0.85 }}>1st in Atlantic Division · 88 PTS</div>
        </div>
        <Button variant="secondary" style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff" }}>View Season</Button>
      </div>

      <div style={{ display: "flex", gap: "16px" }}>
        <Panel title="Next Match" width="320px">
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <StatusPill tone="home" label={TEAM} />
              <span style={{ font: "var(--text-data-md)", color: "var(--text-tertiary)" }}>vs</span>
              <StatusPill tone="away" label="Bay Union" />
            </div>
            <div style={{ font: "var(--text-data-sm)", color: "var(--text-tertiary)" }}>Sat · 7:00 PM · Ironclad Arena</div>
            <Button size="sm">View Matchup</Button>
          </div>
        </Panel>

        <Panel title="Roster Health" width="320px">
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <StatMeter label="Avg Fitness" value={88} max={100} tone="success" />
            <StatMeter label="Avg Fatigue" value={42} max={100} tone="danger" />
            <StatMeter label="Team Morale" value={81} max={100} tone="info" />
          </div>
        </Panel>

        <Panel title="Recent Form" width="320px">
          <div style={{ display: "flex", gap: "6px" }}>
            <StatusPill tone="win" label="W" />
            <StatusPill tone="win" label="W" />
            <StatusPill tone="otl" label="OTL" />
            <StatusPill tone="win" label="W" />
            <StatusPill tone="loss" label="L" />
          </div>
        </Panel>
      </div>

      <div>
        <div style={{ font: "var(--text-label)", letterSpacing: "var(--text-tracking-wide)", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px" }}>Roster snapshot</div>
        <PlayerTable players={roster} />
      </div>
    </div>
  );
}

function StandingsScreen() {
  return (
    <div style={{ padding: "20px" }}>
      <StandingsTable rows={standings} highlightTeam={TEAM} />
    </div>
  );
}

function PlayoffsScreen() {
  return (
    <div style={{ padding: "20px" }}>
      <Bracket rounds={bracketRounds} />
    </div>
  );
}

function PlayerProfileScreen() {
  return (
    <div style={{ padding: "20px", display: "flex", gap: "20px", alignItems: "flex-start" }}>
      <PlayerCard name="A. Kessler" position="C" number={17} team={TEAM} overall={87}
        stats={[{ label: "SPD", value: 82 }, { label: "SHT", value: 88 }, { label: "DEF", value: 64 }]} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
        <Panel title="Season Stats">
          <StatsTable
            columns={[{ key: "name", label: "Player" }, { key: "gp", label: "GP" }, { key: "g", label: "G" }, { key: "a", label: "A" }, { key: "pts", label: "PTS" }]}
            rows={scorers}
            highlightId={1}
          />
        </Panel>
        <div style={{ display: "flex", gap: "8px" }}>
          <Badge tone="success">Healthy</Badge>
          <Badge tone="primary">Team Captain</Badge>
          <Badge tone="info">Contract: 2 yrs left</Badge>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [screen, setScreen] = React.useState("dashboard");
  const titles = { dashboard: "Dashboard", standings: "League Standings", playoffs: "Playoffs", player: "Player Profile" };
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <Sidebar screen={screen} setScreen={setScreen} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
        <TopBar title={titles[screen]} />
        {screen === "dashboard" && <DashboardScreen />}
        {screen === "standings" && <StandingsScreen />}
        {screen === "playoffs" && <PlayoffsScreen />}
        {screen === "player" && <PlayerProfileScreen />}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
