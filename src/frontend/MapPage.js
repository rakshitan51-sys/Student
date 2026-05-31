
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ================================
// Fix Leaflet Default Marker
// ================================
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ================================
// Icons
// ================================
const busIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3448/3448339.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
});

const studentIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3177/3177440.png",
  iconSize: [35, 35],
  iconAnchor: [17, 35],
});

const collegeIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/167/167707.png",
  iconSize: [35, 35],
  iconAnchor: [17, 35],
});

// ================================
// College Coordinates
// ================================
const COLLEGE_LAT = 14.9657;
const COLLEGE_LNG = 74.7092;

// ================================
// Backend URL
// ================================
const DRIVER_API = "https://backendstudent-1.onrender.com";
const OSRM_BASE  = "https://router.project-osrm.org/route/v1/driving";

// ================================
// Distance Calculator (air)
// ================================
function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ================================
// Road Distance via OSRM
// (with 6s timeout + 2 retries)
// ================================
async function fetchRoadKm(lat, lng, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(
        `${OSRM_BASE}/${lng},${lat};${COLLEGE_LNG},${COLLEGE_LAT}?overview=false`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.routes?.length > 0) {
        return parseFloat((data.routes[0].distance / 1000).toFixed(1));
      }
    } catch (_) {
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null;
}

// ================================
// Stat Card Component
// ================================
function StatCard({ value, label, color, icon, distMode }) {
  // distMode: "road" | "air" | "loading" | null
  const badge =
    distMode === "road"    ? { text: "📡 Road",     color: "#16a34a" } :
    distMode === "loading" ? { text: "⏳ Fetching…", color: "#f59e0b" } :
    distMode === "air"     ? { text: "📐 Air est.",  color: "#94a3b8" } :
    null;

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
      <div style={{ fontSize: "1.6rem", fontWeight: 800, color, lineHeight: 1.1 }}>
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
      {badge && (
        <div style={{
          fontSize: "0.58rem",
          color: badge.color,
          marginTop: 3,
          fontWeight: 600,
        }}>
          {badge.text}
        </div>
      )}
    </div>
  );
}

// ================================
// Recenter Map
// ================================
function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, map.getZoom());
  }, [position, map]);
  return null;
}

// ================================
// Main Component
// ================================
export default function MapPage() {
  const navigate = useNavigate();

  // ================================
  // Student Data
  // ================================
  const student = (() => {
    try {
      return JSON.parse(localStorage.getItem("student") || "{}");
    } catch {
      return {};
    }
  })();

  const studentRoute = student.route || "";

  // ================================
  // States
  // ================================
  const [busPosition, setBusPosition] = useState([COLLEGE_LAT, COLLEGE_LNG]);
  const [studentPosition, setStudentPosition] = useState(null);
  const [driverName, setDriverName]   = useState("—");
  const [busNo, setBusNo]             = useState("—");
  const [distKm, setDistKm]           = useState(null);
  const [distMode, setDistMode]       = useState(null); // ← NEW: "road"|"air"|"loading"
  const [etaMin, setEtaMin]           = useState(null);
  const [lastUpdate, setLastUpdate]   = useState(null);
  const [wsStatus, setWsStatus]       = useState("Connecting...");
  const [isLive, setIsLive]           = useState(false);
  const [currentStage, setCurrentStage] = useState(0);

  const stops = (student.stops || []).map((s) =>
    typeof s === "string" ? { name: s, lat: null, lng: null } : s
  );

  const wsRef      = useRef(null);
  const mountedRef = useRef(true);

  // ================================
  // updateDistance:
  // 1) Show air instantly
  // 2) Upgrade to road in background
  // ================================
  const updateDistance = useCallback((lat, lng) => {
    const airKm = parseFloat(haversineKm(lat, lng, COLLEGE_LAT, COLLEGE_LNG).toFixed(1));
    setDistKm(airKm);
    setDistMode("loading");
    setEtaMin(Math.round((airKm / 40) * 60));

    fetchRoadKm(lat, lng).then((roadKm) => {
      if (!mountedRef.current) return;
      if (roadKm !== null) {
        setDistKm(roadKm);
        setDistMode("road");
        setEtaMin(Math.round((roadKm / 40) * 60));
      } else {
        setDistMode("air");
      }
    });
  }, []);

  // ================================
  // Student Live GPS Location
  // ================================
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setStudentPosition([pos.coords.latitude, pos.coords.longitude]);
      },
      (err) => { console.log(err); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ================================
  // WebSocket Live Updates
  // ================================
  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;

      const ws = new WebSocket("ws://localhost:8000/ws");
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
            const msgRoute = (msg.route || "").toLowerCase().trim();
            const myRoute  = (studentRoute || "").toLowerCase().trim();

            if (!myRoute || msgRoute !== myRoute) return;

            if (msg.lat && msg.lng) {
              setBusPosition([msg.lat, msg.lng]);
              setDriverName(msg.name  || "—");
              setBusNo(msg.busNo      || "—");
              setLastUpdate(new Date().toLocaleTimeString());
              setCurrentStage(msg.stageIndex || 0);

              // ✅ Road distance (was haversine before)
              updateDistance(msg.lat, msg.lng);
            }
          }
        } catch (_) {}
      };

      ws.onerror = () => {
        if (mountedRef.current) {
          setWsStatus("⚠️ Error");
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
  }, [studentRoute, updateDistance]);

  // ================================
  // REST Fallback
  // ================================
  useEffect(() => {
    let active = true;

    async function fetchLocation() {
      if (!studentRoute) return;
      try {
        const res  = await fetch(`${DRIVER_API}/locations/all`);
        const list = await res.json();
        if (!Array.isArray(list)) return;

        const match = list.find(
          (d) =>
            (d.route || "").toLowerCase().trim() ===
            studentRoute.toLowerCase().trim()
        );

        if (match && match.lat && match.lng && active) {
          setBusPosition([match.lat, match.lng]);
          setDriverName(match.name  || "—");
          setBusNo(match.busNo      || "—");
          setLastUpdate(new Date().toLocaleTimeString());

          // ✅ Road distance (was haversine before)
          updateDistance(match.lat, match.lng);
        }
      } catch (_) {}
    }

    fetchLocation();
    const interval = setInterval(fetchLocation, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [studentRoute, updateDistance]);

  // ================================
  // UI
  // ================================
  return (
    <div
      style={{
        fontFamily: "sans-serif",
        maxWidth: 480,
        margin: "0 auto",
        padding: 12,
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>
        🚍 Live Bus Tracking
      </h2>

      {/* STATUS */}
      <div
        style={{
          background: isLive ? "#f0fdf4" : "#fff7ed",
          border: `1px solid ${isLive ? "#86efac" : "#fed7aa"}`,
          borderRadius: 10,
          padding: "8px 12px",
          marginBottom: 10,
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.8rem",
        }}
      >
        <span>{wsStatus}</span>
        {lastUpdate && <span>{lastUpdate}</span>}
      </div>

      {/* INFO */}
      <div
        style={{
          background: "#eff6ff",
          borderRadius: 10,
          padding: 12,
          marginBottom: 10,
          fontSize: "0.85rem",
        }}
      >
        <div><b>🚌 Bus:</b> {busNo}</div>
        <div><b>👤 Driver:</b> {driverName}</div>
        <div><b>🛣 Route:</b> {studentRoute || "—"}</div>
        <div><b>📏 Distance:</b> {distKm || "--"} KM</div>
        <div><b>⏱ ETA:</b> {etaMin || "--"} mins</div>
      </div>

      {/* ✅ NEW: STAT CARDS (KM Left + ETA) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <StatCard
          value={distKm}
          label="KM Left"
          color="#3b82f6"
          icon="🛣️"
          distMode={distMode}
        />
        <StatCard
          value={etaMin}
          label="ETA (min)"
          color="#f97316"
          icon="🕐"
          distMode={null}
        />
      </div>

      {/* MAP — unchanged */}
      <MapContainer
        center={studentPosition || busPosition}
        zoom={13}
        style={{ height: "55vh", borderRadius: 14, overflow: "hidden" }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <RecenterMap position={studentPosition || busPosition} />

        <Marker position={busPosition} icon={busIcon}>
          <Popup>🚌 Bus <br /> Driver: {driverName}</Popup>
        </Marker>

        {studentPosition && (
          <Marker position={studentPosition} icon={studentIcon}>
            <Popup>👨‍🎓 Your Location</Popup>
          </Marker>
        )}

        <Marker position={[COLLEGE_LAT, COLLEGE_LNG]} icon={collegeIcon}>
          <Popup>🎓 College</Popup>
        </Marker>

        {studentPosition && (
          <Polyline
            positions={[busPosition, studentPosition]}
            color="red"
            weight={4}
          />
        )}

        {studentPosition && (
          <Polyline
            positions={[[COLLEGE_LAT, COLLEGE_LNG], studentPosition]}
            color="blue"
            weight={4}
          />
        )}

        {stops.filter((s) => s.lat && s.lng).length > 1 && (
          <Polyline
            positions={stops.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng])}
            color="#1565C0"
            weight={4}
          />
        )}
      </MapContainer>

      {/* ROUTE STOPS — unchanged */}
      {stops.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>📍 Route Stops</div>
          {stops.map((s, i) => {
            let status = "⏳ Upcoming";
            if (i < currentStage)      status = "✅ Passed";
            else if (i === currentStage) status = "🟢 Arriving";

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  marginBottom: 6,
                  borderRadius: 8,
                  background: i === currentStage ? "#f0fdf4" : "#f8fafc",
                  border: `1px solid ${i === currentStage ? "#86efac" : "#e2e8f0"}`,
                }}
              >
                <span>{i + 1}. {s.name}</span>
                <span>{status}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* BOTTOM BUTTONS — unchanged */}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button
          onClick={() => navigate("/dashboard")}
          style={{
            flex: 1, padding: 12, borderRadius: 10, border: "none",
            background: "#f1f5f9", fontWeight: 700, cursor: "pointer",
          }}
        >
          🏠 Dashboard
        </button>
        <button
          onClick={() => navigate("/map")}
          style={{
            flex: 1, padding: 12, borderRadius: 10, border: "none",
            background: "#1565C0", color: "white", fontWeight: 700, cursor: "pointer",
          }}
        >
          🚌 Live Tracking
        </button>
      </div>
    </div>
  );
}
