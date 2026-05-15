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

// =====================================
// FIX LEAFLET DEFAULT ICON
// =====================================
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",

  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",

  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// =====================================
// ICONS
// =====================================

// 🚌 BUS ICON
const busIcon = new L.Icon({
  iconUrl:
      "https://cdn-icons-png.flaticon.com/512/3448/3448339.png",

  iconSize: [50, 50],
  iconAnchor: [25, 50],
});

// 👨‍🎓 STUDENT ICON
const studentIcon = new L.Icon({
  iconUrl:
    "https://cdn-icons-png.flaticon.com/512/3177/3177440.png",

  iconSize: [42, 42],
  iconAnchor: [21, 42],
});

// 🎓 COLLEGE ICON
const collegeIcon = new L.Icon({
  iconUrl:
    "https://cdn-icons-png.flaticon.com/512/167/167707.png",

  iconSize: [42, 42],
  iconAnchor: [21, 42],
});

// =====================================
// COLLEGE LOCATION
// =====================================
const COLLEGE_LAT = 14.9657;
const COLLEGE_LNG = 74.7092;

// =====================================
// BACKEND API
// =====================================
const DRIVER_API =
  "https://backendstudent-1.onrender.com";

// =====================================
// RECENTER MAP
// =====================================
function RecenterMap({ position }) {
  const map = useMap();

  useEffect(() => {
    map.setView(position, map.getZoom());
  }, [position, map]);

  return null;
}

// =====================================
// MAIN COMPONENT
// =====================================
export default function MapPage() {
  const navigate = useNavigate();

  // =====================================
  // STUDENT DATA
  // =====================================
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

  // =====================================
  // STATES
  // =====================================
  const [busPosition, setBusPosition] =
    useState([
      COLLEGE_LAT,
      COLLEGE_LNG,
    ]);

  const [studentPosition,
    setStudentPosition] =
    useState(null);

  // 🛣 ROAD ROUTES
  const [busToStudentRoute,
    setBusToStudentRoute] =
    useState([]);

  const [studentToCollegeRoute,
    setStudentToCollegeRoute] =
    useState([]);

  const [driverName,
    setDriverName] =
    useState("—");

  const [busNo,
    setBusNo] =
    useState("—");

  const [lastUpdate,
    setLastUpdate] =
    useState(null);

  const [wsStatus,
    setWsStatus] =
    useState("Connecting...");

  const [isLive,
    setIsLive] =
    useState(false);

  const wsRef = useRef(null);

  const mountedRef =
    useRef(true);

  // =====================================
  // STUDENT LIVE LOCATION
  // =====================================
  useEffect(() => {
    if (!navigator.geolocation)
      return;

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
      navigator.geolocation.clearWatch(
        watchId
      );
  }, []);

  // =====================================
  // FETCH ROAD ROUTES
  // =====================================
  useEffect(() => {
    async function fetchRoutes() {
      if (!studentPosition)
        return;

      try {
        // =============================
        // BUS ➜ STUDENT ROAD
        // =============================
        const busUrl = `https://router.project-osrm.org/route/v1/driving/${busPosition[1]},${busPosition[0]};${studentPosition[1]},${studentPosition[0]}?overview=full&geometries=geojson`;

        const busRes =
          await fetch(busUrl);

        const busData =
          await busRes.json();

        if (
          busData.routes &&
          busData.routes.length > 0
        ) {
          const coords =
            busData.routes[0].geometry.coordinates.map(
              (c) => [c[1], c[0]]
            );

          setBusToStudentRoute(
            coords
          );
        }

        // =============================
        // STUDENT ➜ COLLEGE ROAD
        // =============================
        const collegeUrl = `https://router.project-osrm.org/route/v1/driving/${studentPosition[1]},${studentPosition[0]};${COLLEGE_LNG},${COLLEGE_LAT}?overview=full&geometries=geojson`;

        const collegeRes =
          await fetch(collegeUrl);

        const collegeData =
          await collegeRes.json();

        if (
          collegeData.routes &&
          collegeData.routes.length > 0
        ) {
          const coords =
            collegeData.routes[0].geometry.coordinates.map(
              (c) => [c[1], c[0]]
            );

          setStudentToCollegeRoute(
            coords
          );
        }
      } catch (err) {
        console.log(err);
      }
    }

    fetchRoutes();
  }, [busPosition, studentPosition]);

  // =====================================
  // WEBSOCKET LIVE LOCATION
  // =====================================
  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current)
        return;

      const ws = new WebSocket(
        "ws://localhost:8000/ws"
      );

      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("🟢 Live");
        setIsLive(true);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(
            e.data
          );

          if (
            msg.type === "location"
          ) {
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

            if (
              msgRoute !== myRoute
            )
              return;

            if (
              msg.lat &&
              msg.lng
            ) {
              setBusPosition([
                msg.lat,
                msg.lng,
              ]);

              setDriverName(
                msg.name || "—"
              );

              setBusNo(
                msg.busNo || "—"
              );

              setLastUpdate(
                new Date().toLocaleTimeString()
              );
            }
          }
        } catch (err) {
          console.log(err);
        }
      };

      ws.onerror = () => {
        setWsStatus("⚠️ Error");
        setIsLive(false);
      };

      ws.onclose = () => {
        setWsStatus(
          "🔄 Reconnecting..."
        );

        setIsLive(false);

        setTimeout(
          connect,
          5000
        );
      };
    }

    connect();

    return () => {
      mountedRef.current = false;

      wsRef.current?.close();
    };
  }, [studentRoute]);

  // =====================================
  // REST FALLBACK
  // =====================================
  useEffect(() => {
    async function fetchLocation() {
      if (!studentRoute)
        return;

      try {
        const res = await fetch(
          `${DRIVER_API}/locations/all`
        );

        const list =
          await res.json();

        if (
          !Array.isArray(list)
        )
          return;

        const match =
          list.find(
            (d) =>
              (d.route || "")
                .toLowerCase()
                .trim() ===
              studentRoute
                .toLowerCase()
                .trim()
          );

        if (
          match &&
          match.lat &&
          match.lng
        ) {
          setBusPosition([
            match.lat,
            match.lng,
          ]);

          setDriverName(
            match.name || "—"
          );

          setBusNo(
            match.busNo || "—"
          );

          setLastUpdate(
            new Date().toLocaleTimeString()
          );
        }
      } catch (err) {
        console.log(err);
      }
    }

    fetchLocation();

    const interval =
      setInterval(
        fetchLocation,
        10000
      );

    return () =>
      clearInterval(interval);
  }, [studentRoute]);

  // =====================================
  // UI
  // =====================================
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
          marginBottom: 10,
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
            isLive
              ? "#86efac"
              : "#fed7aa"
          }`,

          borderRadius: 12,

          padding: 10,

          marginBottom: 10,

          display: "flex",

          justifyContent:
            "space-between",
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

          borderRadius: 12,

          padding: 14,

          marginBottom: 12,

          lineHeight: 1.8,
        }}
      >
        <div>
          🚌 <b>Bus:</b> {busNo}
        </div>

        <div>
          👤 <b>Driver:</b>{" "}
          {driverName}
        </div>

        <div>
          🛣 <b>Route:</b>{" "}
          {studentRoute}
        </div>
      </div>

      {/* MAP */}
      <MapContainer
        center={
          studentPosition ||
          busPosition
        }
        zoom={12}
        style={{
          height: "70vh",
          borderRadius: 18,
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
            🚌 Driver:
            {driverName}
            <br />
            Bus: {busNo}
          </Popup>
        </Marker>

        {/* 👨‍🎓 STUDENT */}
        {studentPosition && (
          <Marker
            position={
              studentPosition
            }
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

        {/* 🔴 BUS ➜ STUDENT */}
        {busToStudentRoute.length >
          0 && (
          <Polyline
            positions={
              busToStudentRoute
            }
            color="red"
            weight={6}
          />
        )}

        {/* 🔵 STUDENT ➜ COLLEGE */}
        {studentToCollegeRoute.length >
          0 && (
          <Polyline
            positions={
              studentToCollegeRoute
            }
            color="blue"
            weight={6}
          />
        )}
      </MapContainer>

      {/* BUTTONS */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 16,
        }}
      >
        <button
          onClick={() =>
            navigate(
              "/dashboard"
            )
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
            color: "red",
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
