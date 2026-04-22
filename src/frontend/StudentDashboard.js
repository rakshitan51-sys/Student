import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [student, setStudent] = useState(() => {
    try { return JSON.parse(localStorage.getItem("student") || "{}"); }
    catch { return {}; }
  });

  // Re-fetch fresh data on every load
  // This ensures if admin assigns route AFTER login, student sees it.
  useEffect(() => {
    const stored = (() => {
      try { return JSON.parse(localStorage.getItem("student") || "{}"); }
      catch { return {}; }
    })();

    if (!stored.rollNo || !stored.password) return;

    // ✅ NOTE: Student backend runs on port 8002
    // If you are running a single unified backend on 8000, change to 8000
    fetch("https://backendstudent-1.onrender.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rollNo: stored.rollNo, password: stored.password })
    })
      .then(r => r.json())
      .then(data => {
        if (!data.error) {
          const updated = { ...data, password: stored.password };
          localStorage.setItem("student", JSON.stringify(updated));
          setStudent(updated);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("student");
    navigate("/");
  };

  const stops    = student.stops || [];
  const hasRoute = student.route && student.route.trim() !== "";

  return (
    <div style={styles.page}>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.busIconWrap}>🚌</div>
          <div>
            <div style={styles.headerTitle}>COLLEGE BUS &</div>
            <div style={styles.headerTitle}>STUDENT TRACKING</div>
          </div>
        </div>
        <button style={styles.logoutBtn} onClick={handleLogout}>⎋ Logout</button>
      </div>

      {/* Scrollable Content */}
      <div style={styles.content}>

        {/* Welcome */}
        <div style={styles.welcomeBar}>
          <div>
            <div style={styles.welcomeName}>
              Welcome, {student.name || "Student"} 👋
            </div>
            <div style={styles.welcomeSub}>
              Class: {student.className || "—"} &nbsp;|&nbsp; Roll: {student.rollNo || "—"}
            </div>
          </div>
          <div style={styles.onlineDot}>● Online</div>
        </div>

        {/* Warning if route not assigned */}
        {!hasRoute && (
          <div style={styles.warningBar}>
            ⚠️ Your route has not been assigned yet. Please contact admin.
          </div>
        )}

        {/* Bus Info Card */}
        <div style={styles.busCard}>
          <div style={styles.busCardLeft}>
            <div style={styles.busEmoji}>🚌</div>
            <div>
              <div style={styles.busNumber}>
                {student.busNo && student.busNo !== "" ? `Bus: ${student.busNo}` : "Bus: Not Assigned"}
              </div>
              <div style={styles.busRoute}>
                Route: <b>{student.route || "Not Assigned"}</b>
              </div>
            </div>
          </div>
          <div style={styles.liveBadge}>🔴 LIVE</div>
        </div>

        {/* Info Grid */}
        <div style={styles.infoGrid}>
          <div style={styles.infoBox}>
            <div style={styles.infoIcon}>🚏</div>
            <div style={styles.infoVal}>{student.stage || "—"}</div>
            <div style={styles.infoLbl}>Your Stop</div>
          </div>
          <div style={styles.infoBox}>
            <div style={styles.infoIcon}>👤</div>
            <div style={styles.infoVal}>{student.driverName || "Not Assigned"}</div>
            <div style={styles.infoLbl}>Driver Name</div>
          </div>
          <div style={styles.infoBox}>
            <div style={styles.infoIcon}>📞</div>
            <div style={styles.infoVal}>{student.driverNo || "—"}</div>
            <div style={styles.infoLbl}>Driver Phone</div>
          </div>
          <div style={styles.infoBox}>
            <div style={styles.infoIcon}>🚌</div>
            <div style={styles.infoVal}>{student.busNo || "Not Assigned"}</div>
            <div style={styles.infoLbl}>Bus No</div>
          </div>
        </div>

        {/* Track Button */}
        <button style={styles.trackBtn} onClick={() => navigate("/map")}>
          📍 Track My Bus Live
        </button>

        {/* Route Stages */}
        {stops.length > 0 && (
          <div style={styles.stagesCard}>
            <div style={styles.stagesTitle}>
              🛣️ Route Stages — {student.route}
            </div>
            <div style={styles.stagesList}>
              {stops.map((stop, i) => {
                const name = typeof stop === "string" ? stop : stop.name;
                const isYours = name?.toLowerCase() === student.stage?.toLowerCase();
                return (
                  <div key={i} style={{
                    ...styles.stageRow,
                    background: isYours ? "#eff6ff" : "white",
                    border: `1.5px solid ${isYours ? "#93c5fd" : "#e2e8f0"}`,
                  }}>
                    <div style={styles.stageConnector}>
                      <div style={{
                        ...styles.stageDot,
                        background: isYours ? "#1565C0" : "#cbd5e1",
                        transform: isYours ? "scale(1.3)" : "scale(1)",
                      }} />
                      {i < stops.length - 1 && <div style={styles.stageLine} />}
                    </div>
                    <div style={styles.stageInfo}>
                      <div style={{
                        fontWeight: isYours ? 700 : 500,
                        fontSize: "0.88rem",
                        color: isYours ? "#1565C0" : "#1e293b",
                      }}>
                        {name}
                        {isYours && (
                          <span style={styles.yourStopBadge}>📍 Your Stop</span>
                        )}
                      </div>
                      <div style={styles.stageNum}>Stop {i + 1}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ height: 80 }} />
      </div>

      {/* Bottom Nav */}
      <div style={styles.bottomNav}>
        <button style={{ ...styles.navBtn, ...styles.navBtnActive }} onClick={() => navigate("/dashboard")}>
          <span style={styles.navIcon}>🏠</span>
          <span style={styles.navLblActive}>Dashboard</span>
        </button>
        <button style={styles.navBtn} onClick={() => navigate("/map")}>
          <span style={styles.navIcon}>🚌</span>
          <span style={styles.navLbl}>Live Tracking</span>
        </button>
      </div>

    </div>
  );
}

const styles = {
  page: { fontFamily: "'Segoe UI', sans-serif", background: "#f1f5f9", minHeight: "100vh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" },
  header: { background: "linear-gradient(135deg, #0C67A0, #033452)", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "white" },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  busIconWrap: { fontSize: 28, background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "4px 8px" },
  headerTitle: { fontWeight: 800, fontSize: "0.78rem", letterSpacing: 0.5, lineHeight: 1.3 },
  logoutBtn: { background: "rgba(255,255,255,0.15)", border: "none", color: "white", fontSize: "0.78rem", fontWeight: 700, borderRadius: 8, padding: "6px 10px", cursor: "pointer" },
  content: { flex: 1, overflowY: "auto", padding: "14px 14px 0" },
  welcomeBar: { background: "white", borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  welcomeName: { fontWeight: 700, fontSize: "1rem", color: "#1e293b" },
  welcomeSub: { fontSize: "0.75rem", color: "#64748b", marginTop: 2 },
  onlineDot: { color: "#22c55e", fontWeight: 700, fontSize: "0.78rem" },
  warningBar: { background: "#fefce8", border: "1px solid #fde047", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: "0.82rem", color: "#854d0e", fontWeight: 600 },
  busCard: { background: "linear-gradient(135deg, #1565C0, #0C67A0)", borderRadius: 14, padding: "16px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", color: "white", boxShadow: "0 4px 14px rgba(21,101,192,0.35)" },
  busCardLeft: { display: "flex", alignItems: "center", gap: 12 },
  busEmoji: { fontSize: 32, background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "4px 8px" },
  busNumber: { fontWeight: 800, fontSize: "1.15rem", letterSpacing: 0.5 },
  busRoute: { fontSize: "0.8rem", opacity: 0.85, marginTop: 2 },
  liveBadge: { background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "4px 12px", fontSize: "0.75rem", fontWeight: 700, border: "1px solid rgba(255,255,255,0.3)" },
  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 },
  infoBox: { background: "white", borderRadius: 12, padding: "14px 10px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  infoIcon: { fontSize: "1.4rem", marginBottom: 4 },
  infoVal: { fontWeight: 700, fontSize: "0.9rem", color: "#1e293b", marginBottom: 2 },
  infoLbl: { fontSize: "0.72rem", color: "#64748b" },
  trackBtn: { width: "100%", padding: "14px", borderRadius: 12, background: "#16a34a", color: "white", border: "none", fontWeight: 800, fontSize: "1rem", cursor: "pointer", marginBottom: 14, boxShadow: "0 4px 12px rgba(22,163,74,0.35)" },
  stagesCard: { background: "white", borderRadius: 14, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 14 },
  stagesTitle: { fontWeight: 700, fontSize: "0.9rem", color: "#1e293b", marginBottom: 12 },
  stagesList: {},
  stageRow: { display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", borderRadius: 10, marginBottom: 8 },
  stageConnector: { display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2 },
  stageDot: { width: 12, height: 12, borderRadius: "50%", flexShrink: 0 },
  stageLine: { width: 2, height: 20, background: "#e2e8f0", marginTop: 2 },
  stageInfo: { flex: 1 },
  stageNum: { fontSize: "0.72rem", color: "#94a3b8", marginTop: 2 },
  yourStopBadge: { marginLeft: 8, fontSize: "0.7rem", background: "#dbeafe", color: "#1565C0", padding: "2px 6px", borderRadius: 6, fontWeight: 600 },
  bottomNav: { position: "sticky", bottom: 0, background: "white", display: "flex", borderTop: "1px solid #e2e8f0", boxShadow: "0 -4px 12px rgba(0,0,0,0.08)" },
  navBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: "10px 0", border: "none", background: "transparent", cursor: "pointer" },
  navBtnActive: { borderBottom: "2px solid #1565C0" },
  navIcon: { fontSize: "1.3rem" },
  navLbl: { fontSize: "0.7rem", color: "#94a3b8", fontWeight: 600 },
  navLblActive: { fontSize: "0.7rem", color: "#1565C0", fontWeight: 700 },
};
