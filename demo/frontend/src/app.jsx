// Main app
const { createRoot } = ReactDOM;

const App = () => {
  const [authed, setAuthed] = useState(false);
  const [screen, setScreen] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  if (!authed) {
    return (
      <div className="app" data-screen="login">
        <LoginScreen onLogin={() => setAuthed(true)}/>
      </div>
    );
  }

  const screens = {
    dashboard: <DashboardScreen/>,
    livedetect: <LiveDetectScreen/>,     // REAL model-driven simulation
    traffic: <TrafficScreen/>,
    threats: <ThreatsScreen/>,
    ml: <MlScreen/>,
    shap: <ShapScreen/>,
    intel: <IntelScreen/>,
    api: <ApiScreen/>,
    settings: <PlaceholderScreen name="Settings"/>,
  };

  return (
    <div className="app" data-collapsed={collapsed} data-screen-label={`screen-${screen}`}>
      <Sidebar active={screen} onNav={setScreen} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)}/>
      <TopBar onLogout={() => setAuthed(false)}/>
      <main style={{ gridColumn: "2 / 3", overflow: "hidden", position: "relative" }}>
        {screens[screen] || <PlaceholderScreen name={screen}/>}
      </main>
    </div>
  );
};

const PlaceholderScreen = ({ name }) => (
  <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 24 }}>
    <div className="glass" style={{ padding: 30, textAlign: "center", maxWidth: 420 }}>
      <Icons.Settings size={28} style={{ color: "var(--text-2)" }}/>
      <div className="t-h1" style={{ marginTop: 12 }}>{name}</div>
      <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>This area is part of the platform shell but not in the current sprint scope.</div>
    </div>
  </div>
);

createRoot(document.getElementById("app")).render(<App/>);
