// MapPage.jsx — Full replacement
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer, TileLayer, Marker,
  Polyline, Popup, useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const busIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3448/3448339.png",
  iconSize: [40, 40], iconAnchor: [20, 40],
});
const studentIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3177/3177440.png",
  iconSize: [35, 35], iconAnchor: [17, 35],
});
const collegeIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/167/167707.png",
  iconSize: [35, 35], iconAnchor: [17, 35],
});

const COLLEGE_LAT = 14.9657;
const COLLEGE_LNG = 74.7092;
const DRIVER_API = "https://backendstudent-1.onrender.com";

// ================================
// Road Distance via OSRM (free)
// Returns km or null on failure
// ================================
async function getRoadDistanceKm(lat1, lng1, lat2, lng2) {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${lng1},${lat1};${lng2},${lat2}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      return (data.routes[0].distance / 1000).toFixed(1); // metres → km
    }
  } catch (_) {}
  return null;
}

function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => { map.setView(position, map.getZoom()); }, [position, map]);
  return null;
}

// ================================
// Stat Card
// ================================
function StatCard({ value, label, color, icon }) {
  return (
    <div style={{
      flex: 1,
      background: "#fff",
      border: `1.5px solid ${color}33`,
      borderRadius: 14,
      padding: "12px 8px",
      textAlign: "center",
      boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
    }}>
      <div style={{
        fontSize: "1.6rem",
        fontWeight: 800,
        color: color,
        lineHeight: 1.1,
      }}>
        {value ?? "--"}
      </div>
      <div style={{
        fontSize: "0.68rem",
        color: "#64748b",
        marginTop: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        fontWeight: 500,
      }}>
        <span>{icon}</span>
        <span>{label}</span>
      </div>
    </div>
  );
}

// ================================
// Main Component
// ================================
export default function MapPage() {
  const navigate = useNavigate();

  const student = (() => {
    try { return JSON.parse(localStorage.getItem("student") || "{}"); }
    catch { return {}; }
  })();
  const studentRoute = student.route || "";

  const [busPosition, setBusPosition] = useState([COLLEGE_LAT, COLLEGE_LNG]);
  const [studentPosition, setStudentPosition] = useState(null);
  const [driverName, setDriverName] = useState("—");
  const [busNo, setBusNo] = useState("—");
  const [roadDistKm, setRoadDistKm] = useState(null);   // road distance
  const [etaMin, setEtaMin] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);

  const stops = (student.stops || []).map((s) =>
    typeof s === "string" ? { name: s, lat: null, lng: null } : s
  );

  const wsRef = useRef(null);
  const mountedRef = useRef(true);

  // ================================
  // Student GPS
  // ================================
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setStudentPosition([pos.coords.latitude, pos.coords.longitude]),
      (err) => console.log(err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ================================
  // Helper: apply location + fetch road distance
  // ================================
  async function applyLocationData(lat, lng, name, busNoVal, stageIndex) {
    setBusPosition([lat, lng]);
    setDriverName(name || "—");
    setBusNo(busNoVal || "—");
    setCurrentStage(stageIndex || 0);
    setLastUpdate(new Date().toLocaleTimeString());

    // Fetch road distance from OSRM
    const roadKm = await getRoadDistanceKm(lat, lng, COLLEGE_LAT, COLLEGE_LNG);
    if (roadKm) {
      setRoadDistKm(roadKm);
      setEtaMin(Math.round((parseFloat(roadKm) / 40) * 60));
    }
  }

  // ================================
  // WebSocket
  // ================================
  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;
      const ws = new WebSocket("ws://localhost:8000/ws");
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) setIsLive(true);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "location") {
            const msgRoute = (msg.route || "").toLowerCase().trim();
            const myRoute = (studentRoute || "").toLowerCase().trim();
            if (!myRoute || msgRoute !== myRoute) return;
            if (msg.lat && msg.lng) {
              applyLocationData(msg.lat, msg.lng, msg.name, msg.busNo, msg.stageIndex);
            }
          }
        } catch (_) {}
      };

      ws.onerror = () => { if (mountedRef.current) setIsLive(false); };

      ws.onclose = () => {
        if (mountedRef.current) {
          setIsLive(false);
          setTimeout(connect, 5000);
        }
      };
    }

    connect();
    return () => { mountedRef.current = false; wsRef.current?.close(); };
  }, [studentRoute]);

  // ================================
  // REST Fallback (every 10s)
  // ================================
  useEffect(() => {
    async function fetchLocation() {
      if (!studentRoute) return;
      try {
        const res = await fetch(`${DRIVER_API}/locations/all`);
        const list = await res.json();
        if (!Array.isArray(list)) return;
        const match = list.find(
          (d) => (d.route || "").toLowerCase().trim() === studentRoute.toLowerCase().trim()
        );
        if (match && match.lat && match.lng) {
          applyLocationData(match.lat, match.lng, match.name, match.busNo, match.stageIndex);
        }
      } catch (_) {}
    }
    fetchLocation();
    const interval = setInterval(fetchLocation, 10000);
    return () => clearInterval(interval);
  }, [studentRoute]);

  // ================================
  // UI
  // ================================
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto", background: "#f1f5f9", minHeight: "100vh" }}>

      {/* ── HEADER ── */}
      <div style={{
        background: "linear-gradient(135deg, #1565C0, #1e88e5)",
        padding: "16px 16px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <span style={{ fontSize: "1.5rem" }}>🚍</span>
        <div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: "1rem", letterSpacing: 0.3 }}>
            Live Bus Tracking
          </div>
          <div style={{ color: "#bbdefb", fontSize: "0.72rem", marginTop: 1 }}>
            {studentRoute ? `Route: ${studentRoute}` : "No route assigned"}
          </div>
        </div>

        {/* Live dot — top right */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: isLive ? "#4ade80" : "#f87171",
            display: "inline-block",
            boxShadow: isLive ? "0 0 0 3px #4ade8044" : "none",
          }} />
          <span style={{ color: "#fff", fontSize: "0.72rem", fontWeight: 600 }}>
            {isLive ? "Live" : "Offline"}
          </span>
        </div>
      </div>

      <div style={{ padding: 12 }}>

        {/* INFO CARD */}
        <div style={{
          background: "#fff",
          borderRadius: 12,
          padding: "10px 14px",
          marginBottom: 10,
          fontSize: "0.85rem",
          boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>🚌</span>
            <span><b>Bus:</b> {busNo}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>👤</span>
            <span><b>Driver:</b> {driverName}</span>
          </div>
          {lastUpdate && (
            <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 2 }}>
              Last updated: {lastUpdate}
            </div>
          )}
        </div>

        {/* STAT CARDS */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <StatCard
            value={roadDistKm}
            label="KM Left"
            color="#3b82f6"
            icon="✏️"
          />
          <StatCard
            value={etaMin}
            label="ETA (min)"
            color="#f97316"
            icon="🕐"
          />
        </div>

        {/* MAP */}
        <MapContainer
          center={studentPosition || busPosition}
          zoom={13}
          style={{ height: "52vh", borderRadius: 14, overflow: "hidden" }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <RecenterMap position={studentPosition || busPosition} />

          <Marker position={busPosition} icon={busIcon}>
            <Popup>🚌 Bus<br />Driver: {driverName}</Popup>
          </Marker>

          {studentPosition && (
            <Marker position={studentPosition} icon={studentIcon}>
              <Popup>👨‍🎓 Your Location</Popup>
            </Marker>
          )}

          <Marker position={[COLLEGE_LAT, COLLEGE_LNG]} icon={collegeIcon}>
            <Popup>🎓 Vishwadarshana College</Popup>
          </Marker>

          {studentPosition && (
            <Polyline positions={[busPosition, studentPosition]} color="red" weight={3} dashArray="6" />
          )}
          {studentPosition && (
            <Polyline positions={[[COLLEGE_LAT, COLLEGE_LNG], studentPosition]} color="#1565C0" weight={3} />
          )}
          {stops.filter((s) => s.lat && s.lng).length > 1 && (
            <Polyline
              positions={stops.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng])}
              color="#1565C0" weight={4}
            />
          )}
        </MapContainer>

        {/* ROUTE STOPS */}
        {stops.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{
              fontWeight: 700, marginBottom: 8, fontSize: "0.9rem",
              color: "#1e293b",
            }}>
              📍 Route Stops
            </div>
            {stops.map((s, i) => {
              const status =
                i < currentStage ? "✅ Passed" :
                i === currentStage ? "🟢 Arriving" : "⏳ Upcoming";
              return (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "10px 14px", marginBottom: 6, borderRadius: 10,
                  background: i === currentStage ? "#f0fdf4" : "#fff",
                  border: `1px solid ${i === currentStage ? "#86efac" : "#e2e8f0"}`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  fontSize: "0.85rem",
                }}>
                  <span style={{ fontWeight: i === currentStage ? 700 : 400 }}>
                    {i + 1}. {s.name}
                  </span>
                  <span>{status}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* BOTTOM BUTTONS */}
        <div style={{ display: "flex", gap: 10, marginTop: 16, paddingBottom: 16 }}>
          <button onClick={() => navigate("/dashboard")} style={{
            flex: 1, padding: 12, borderRadius: 10, border: "none",
            background: "#f1f5f9", fontWeight: 700, cursor: "pointer",
            fontSize: "0.9rem", color: "#334155",
          }}>
            🏠 Dashboard
          </button>
          <button onClick={() => navigate("/map")} style={{
            flex: 1, padding: 12, borderRadius: 10, border: "none",
            background: "#1565C0", color: "white",
            fontWeight: 700, cursor: "pointer", fontSize: "0.9rem",
          }}>
            🚌 Live Tracking
          </button>
        </div>

      </div>
    </div>
  );
}
