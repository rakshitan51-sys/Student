import { useEffect, useRef, useState } from "react";
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

// 🚌 Bus Icon
const busIcon = new L.Icon({
  iconUrl:
    "https://cdn-icons-png.flaticon.com/512/3448/3448339.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
});

// 👨‍🎓 Student Icon
const studentIcon = new L.Icon({
  iconUrl:
    "https://cdn-icons-png.flaticon.com/512/3177/3177440.png",
  iconSize: [35, 35],
  iconAnchor: [17, 35],
});

// 🎓 College Icon
const collegeIcon = new L.Icon({
  iconUrl:
    "https://cdn-icons-png.flaticon.com/512/167/167707.png",
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
const DRIVER_API =
  "https://backendstudent-1.onrender.com";

// ================================
// Distance Calculator
// ================================
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;

  const dLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const dLng =
    ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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
      return JSON.parse(
        localStorage.getItem("student") || "{}"
      );
    } catch {
      return {};
    }
  })();

  const studentRoute = student.route || "";

  // ================================
  // States
  // ================================
  const [busPosition, setBusPosition] = useState([
    COLLEGE_LAT,
    COLLEGE_LNG,
  ]);

  const [studentPosition, setStudentPosition] =
    useState(null);

  const [driverName, setDriverName] =
    useState("—");

  const [busNo, setBusNo] = useState("—");

  const [distKm, setDistKm] = useState(null);

  const [etaMin, setEtaMin] = useState(null);

  const [lastUpdate, setLastUpdate] =
    useState(null);

  const [wsStatus, setWsStatus] =
    useState("Connecting...");

  const [isLive, setIsLive] =
    useState(false);

  const [currentStage, setCurrentStage] =
    useState(0);

  const stops = (student.stops || []).map((s) =>
    typeof s === "string"
      ? { name: s, lat: null, lng: null }
      : s
  );

  const wsRef = useRef(null);

  const mountedRef = useRef(true);

  // ================================
  // Student Live GPS Location
  // ================================
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId =
      navigator.geolocation.watchPosition(
        (pos) => {
          setStudentPosition([
            pos.coords.latitude,
            pos.coords.longitude,
          ]);
        },
        (err) => {
          console.log(err);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 10000,
          timeout: 5000,
        }
      );

    return () =>
      navigator.geolocation.clearWatch(watchId);
  }, []);

  // ================================
  // WebSocket Live Updates
  // ================================
  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;

      const ws = new WebSocket(
        "ws://localhost:8000/ws"
      );

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
            const msgRoute = (
              msg.route || ""
            )
              .toLowerCase()
              .trim();

            const myRoute = (
              studentRoute || ""
            )
              .toLowerCase()
              .trim();

            if (!myRoute || msgRoute !== myRoute)
              return;

            if (msg.lat && msg.lng) {
              setBusPosition([
                msg.lat,
                msg.lng,
              ]);

              setDriverName(msg.name || "—");

              setBusNo(msg.busNo || "—");

              const dist = haversineKm(
                msg.lat,
                msg.lng,
                COLLEGE_LAT,
                COLLEGE_LNG
              );

              setDistKm(dist.toFixed(1));

              setEtaMin(
                Math.round((dist / 40) * 60)
              );

              setLastUpdate(
                new Date().toLocaleTimeString()
              );

              setCurrentStage(
                msg.stageIndex || 0
              );
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
  }, [studentRoute]);

  // ================================
  // REST Fallback
  // ================================
  useEffect(() => {
    async function fetchLocation() {
      if (!studentRoute) return;

      try {
        const res = await fetch(
          `${DRIVER_API}/locations/all`
        );

        const list = await res.json();

        if (!Array.isArray(list)) return;

        const match = list.find(
          (d) =>
            (d.route || "")
              .toLowerCase()
              .trim() ===
            studentRoute
              .toLowerCase()
              .trim()
        );

        if (match && match.lat && match.lng) {
          setBusPosition([
            match.lat,
            match.lng,
          ]);

          setDriverName(match.name || "—");

          setBusNo(match.busNo || "—");

          const dist = haversineKm(
            match.lat,
            match.lng,
            COLLEGE_LAT,
            COLLEGE_LNG
          );

          setDistKm(dist.toFixed(1));

          setEtaMin(
            Math.round((dist / 40) * 60)
          );

          setLastUpdate(
            new Date().toLocaleTimeString()
          );
        }
      } catch (_) {}
    }

    fetchLocation();

    const interval = setInterval(
      fetchLocation,
      10000
    );

    return () => clearInterval(interval);
  }, [studentRoute]);

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
      <h2
        style={{
          margin: "0 0 8px",
          fontSize: "1.1rem",
        }}
      >
        🚍 Live Bus Tracking
      </h2>

      {/* STATUS */}
      <div
        style={{
          background: isLive
            ? "#f0fdf4"
            : "#fff7ed",

          border: `1px solid ${
            isLive ? "#86efac" : "#fed7aa"
          }`,

          borderRadius: 10,

          padding: "8px 12px",

          marginBottom: 10,

          display: "flex",

          justifyContent: "space-between",

          fontSize: "0.8rem",
        }}
      >
        <span>{wsStatus}</span>

        {lastUpdate && (
          <span>{lastUpdate}</span>
        )}
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
        <div>
          <b>🚌 Bus:</b> {busNo}
        </div>

        <div>
          <b>👤 Driver:</b> {driverName}
        </div>

        <div>
          <b>🛣 Route:</b>{" "}
          {studentRoute || "—"}
        </div>

        <div>
          <b>📏 Distance:</b>{" "}
          {distKm || "--"} KM
        </div>

        <div>
          <b>⏱ ETA:</b>{" "}
          {etaMin || "--"} mins
        </div>
      </div>

      {/* MAP */}
      <MapContainer
        center={
          studentPosition || busPosition
        }
        zoom={13}
        style={{
          height: "55vh",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <RecenterMap
          position={
            studentPosition ||
            busPosition
          }
        />

        {/* 🚌 BUS */}
        <Marker
          position={busPosition}
          icon={busIcon}
        >
          <Popup>
            🚌 Bus <br />
            Driver: {driverName}
          </Popup>
        </Marker>

        {/* 👨‍🎓 STUDENT */}
        {studentPosition && (
          <Marker
            position={studentPosition}
            icon={studentIcon}
          >
            <Popup>
              👨‍🎓 Your Location
            </Popup>
          </Marker>
        )}

        {/* 🎓 COLLEGE */}
        <Marker
          position={[
            COLLEGE_LAT,
            COLLEGE_LNG,
          ]}
          icon={collegeIcon}
        >
          <Popup>
            🎓 College
          </Popup>
        </Marker>

        {/* 🔴 BUS → STUDENT */}
        {studentPosition && (
          <Polyline
            positions={[
              busPosition,
              studentPosition,
            ]}
            color="red"
            weight={4}
          />
        )}

        {/* 🔵 COLLEGE → STUDENT */}
        {studentPosition && (
          <Polyline
            positions={[
              [
                COLLEGE_LAT,
                COLLEGE_LNG,
              ],
              studentPosition,
            ]}
            color="blue"
            weight={4}
          />
        )}

        {/* 🛣 ROUTE LINE */}
        {stops.filter(
          (s) => s.lat && s.lng
        ).length > 1 && (
          <Polyline
            positions={stops
              .filter(
                (s) => s.lat && s.lng
              )
              .map((s) => [
                s.lat,
                s.lng,
              ])}
            color="#1565C0"
            weight={4}
          />
        )}
      </MapContainer>

      {/* ROUTE STOPS */}
      {stops.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            📍 Route Stops
          </div>

          {stops.map((s, i) => {
            let status =
              "⏳ Upcoming";

            if (i < currentStage)
              status = "✅ Passed";

            else if (
              i === currentStage
            )
              status = "🟢 Arriving";

            return (
              <div
                key={i}
                style={{
                  display: "flex",

                  justifyContent:
                    "space-between",

                  padding: "8px 12px",

                  marginBottom: 6,

                  borderRadius: 8,

                  background:
                    i === currentStage
                      ? "#f0fdf4"
                      : "#f8fafc",

                  border: `1px solid ${
                    i === currentStage
                      ? "#86efac"
                      : "#e2e8f0"
                  }`,
                }}
              >
                <span>
                  {i + 1}. {s.name}
                </span>

                <span>{status}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* BOTTOM BUTTONS */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 16,
        }}
      >
        <button
          onClick={() =>
            navigate("/dashboard")
          }
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: "#f1f5f9",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          🏠 Dashboard
        </button>

        <button
          onClick={() =>
            navigate("/map")
          }
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: "#1565C0",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          🚌 Live Tracking
        </button>
      </div>
    </div>
  );
}
