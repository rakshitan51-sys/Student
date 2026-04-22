import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const busIcon = new L.Icon({
  iconUrl:    "https://cdn-icons-png.flaticon.com/512/3448/3448339.png",
  iconSize:   [40, 40],
  iconAnchor: [20, 40],
});

const COLLEGE_LAT = 14.9657;
const COLLEGE_LNG = 74.7092;

// ✅ FIX: Single backend URL — always use driver backend port 8000
const DRIVER_API = "https://backendstudent-1.onrender.com";

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => { map.setView(position, map.getZoom()); }, [position, map]);
  return null;
}

export default function MapPage() {
  const navigate = useNavigate();

  const student = (() => {
    try { return JSON.parse(localStorage.getItem("student") || "{}"); }
    catch { return {}; }
  })();

  const studentRoute = student.route || "";

  const [busPosition, setBusPosition] = useState([COLLEGE_LAT, COLLEGE_LNG]);
  const [driverName,  setDriverName]  = useState("—");
  const [busNo,       setBusNo]       = useState("—");
  const [distKm,      setDistKm]      = useState(null);
  const [etaMin,      setEtaMin]      = useState(null);
  const [lastUpdate,  setLastUpdate]  = useState(null);
  const [wsStatus,    setWsStatus]    = useState("Connecting...");
  const [isLive,      setIsLive]      = useState(false);
  const [currentStage, setCurrentStage] = useState(0);

  const stops = (student.stops || []).map(s =>
    typeof s === "string" ? { name: s, lat: null, lng: null } : s
  );

  const wsRef      = useRef(null);
  const mountedRef = useRef(true);

  // ✅ FIX: Connect to driver backend WebSocket (port 8000) — NOT a separate student backend
  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;
      const ws = new WebSocket(`ws://localhost:8000/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) {
          setWsStatus("🟢 Live");
          setIsLive(true);
        }
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === "location") {
            // ✅ FIX: Case-insensitive route match
            const msgRoute = (msg.route  || "").toLowerCase().trim();
            const myRoute  = (studentRoute || "").toLowerCase().trim();

            if (!myRoute || msgRoute !== myRoute) return;

            if (msg.lat && msg.lng) {
              setBusPosition([msg.lat, msg.lng]);
              setDriverName(msg.name  || "—");
              setBusNo(msg.busNo      || "—");
              const dist = haversineKm(msg.lat, msg.lng, COLLEGE_LAT, COLLEGE_LNG);
              setDistKm(dist.toFixed(1));
              setEtaMin(Math.round((dist / 40) * 60));
              setLastUpdate(new Date().toLocaleTimeString());
              setCurrentStage(msg.stageIndex || 0);
            }
          }
        } catch (_) {}
      };

      ws.onerror = () => {
        if (mountedRef.current) {
          setWsStatus("⚠️ Connection error");
          setIsLive(false);
        }
      };

      ws.onclose = () => {
        if (mountedRef.current) {
          setWsStatus("🔄 Reconnecting...");
          setIsLive(false);
          setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
    };
  }, [studentRoute]);

  // ✅ FIX: Poll driver backend REST every 10 seconds as fallback
  useEffect(() => {
    async function fetchLocation() {
      if (!studentRoute) return;
      try {
        const res  = await fetch(`${DRIVER_API}/locations/all`);
        const list = await res.json();
        if (!Array.isArray(list)) return;

        const match = list.find(
          d => (d.route || "").toLowerCase().trim() === studentRoute.toLowerCase().trim()
        );
        if (match && match.lat && match.lng) {
          setBusPosition([match.lat, match.lng]);
          setDriverName(match.name  || "—");
          setBusNo(match.busNo      || "—");
          const dist = haversineKm(match.lat, match.lng, COLLEGE_LAT, COLLEGE_LNG);
          setDistKm(dist.toFixed(1));
          setEtaMin(Math.round((dist / 40) * 60));
          setLastUpdate(new Date().toLocaleTimeString());
        }
      } catch (_) {}
    }

    fetchLocation();
    const interval = setInterval(fetchLocation, 10000);
    return () => clearInterval(interval);
  }, [studentRoute]);

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto", padding: 12 }}>

      <h2 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>🚍 Live Bus Tracking</h2>

      {/* No route warning */}
      {!studentRoute && (
        <div style={{
          background: "#fef9c3", border: "1px solid #fde047", borderRadius: 10,
          padding: "10px 14px", marginBottom: 10, fontSize: "0.82rem", color: "#854d0e", fontWeight: 600
        }}>
          ⚠️ No route assigned yet. Contact admin.
        </div>
      )}

      {/* Status Bar */}
      <div style={{
        background: isLive ? "#f0fdf4" : "#fff7ed",
        border: `1.5px solid ${isLive ? "#86efac" : "#fed7aa"}`,
        borderRadius: 10, padding: "8px 14px",
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 10, fontSize: "0.82rem"
      }}>
        <span style={{ fontWeight: 700, color: isLive ? "#16a34a" : "#ea580c" }}>
          {wsStatus}
        </span>
        {lastUpdate && <span style={{ color: "#64748b" }}>Updated: {lastUpdate}</span>}
      </div>

      {/* Bus Info */}
      <div style={{
        background: "#eff6ff", borderRadius: 10,
        padding: "10px 14px", marginBottom: 10,
        display: "flex", gap: 20, fontSize: "0.85rem", flexWrap: "wrap"
      }}>
        <div><b>🚌 Bus:</b> {busNo}</div>
        <div><b>👤 Driver:</b> {driverName}</div>
        <div><b>🛣 Route:</b> {studentRoute || "—"}</div>
      </div>

      {/* ETA + Distance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div style={{ background: "white", borderRadius: 10, padding: 10, textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#1565C0" }}>{distKm ?? "--"}</div>
          <div style={{ fontSize: "0.72rem", color: "#64748b" }}>📏 KM to College</div>
        </div>
        <div style={{ background: "white", borderRadius: 10, padding: 10, textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#16a34a" }}>{etaMin ?? "--"}</div>
          <div style={{ fontSize: "0.72rem", color: "#64748b" }}>⏱ ETA (mins)</div>
        </div>
      </div>

      {/* Map */}
      <MapContainer center={busPosition} zoom={12} style={{ height: "55vh", borderRadius: 14, overflow: "hidden" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <RecenterMap position={busPosition} />
        <Marker position={busPosition} icon={busIcon} />
        <Marker position={[COLLEGE_LAT, COLLEGE_LNG]} />
        {stops.filter(s => s.lat && s.lng).length > 1 && (
          <Polyline positions={stops.filter(s => s.lat && s.lng).map(s => [s.lat, s.lng])} color="#1565C0" weight={4} />
        )}
      </MapContainer>

      {/* Stop List */}
      {stops.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: "0.9rem" }}>📍 Route Stops</div>
          {stops.map((s, i) => {
            let status = "⏳ Upcoming";
            if (i < currentStage)        status = "✅ Passed";
            else if (i === currentStage) status = "🟢 Arriving";
            return (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between",
                padding: "8px 12px", marginBottom: 6, borderRadius: 8,
                background: i === currentStage ? "#f0fdf4" : "#f8fafc",
                border: `1px solid ${i === currentStage ? "#86efac" : "#e2e8f0"}`,
                fontWeight: i === currentStage ? 700 : 400, fontSize: "0.85rem"
              }}>
                <span>{i + 1}. {s.name}</span>
                <span>{status}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Nav */}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={() => navigate("/dashboard")} style={{ flex: 1, padding: 12, borderRadius: 10, background: "#f1f5f9", border: "none", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem" }}>
          🏠 Dashboard
        </button>
        <button onClick={() => navigate("/map")} style={{ flex: 1, padding: 12, borderRadius: 10, background: "#1565C0", color: "white", border: "none", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem" }}>
          🚌 Live Tracking
        </button>
      </div>

    </div>
  );
}
