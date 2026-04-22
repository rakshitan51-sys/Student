from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
import asyncio
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DB
client = MongoClient(
    "mongodb+srv://bus_tracking:bus_tracking@cluster0.hlpjt9m.mongodb.net/bus?retryWrites=true&w=majority"
)
db = client["bus"]
students  = db["students"]
routes    = db["routes"]
drivers   = db["drivers"]
locations = db["locations"]


# ══════════════════════════════════════════
# REGISTER
# ══════════════════════════════════════════
@app.post("/register")
async def register_student(data: dict):
    if students.find_one({"rollNo": data.get("rollNo")}):
        return {"error": "Roll No already registered"}
    data.setdefault("route", "")
    data.setdefault("email", "")
    students.insert_one(data)
    return {"status": "Registered"}


# ══════════════════════════════════════════
# LOGIN
# ══════════════════════════════════════════
@app.post("/login")
async def login(data: dict):
    student = students.find_one({
        "rollNo":   data.get("rollNo"),
        "password": data.get("password")
    }, {"_id": 0})

    if not student:
        return {"error": "Invalid RollNo or Password"}

    student_route = student.get("route", "")

    # Case-insensitive route lookup
    route_doc = None
    if student_route:
        route_doc = routes.find_one(
            {"route_name": {"$regex": f"^{re.escape(student_route)}$", "$options": "i"}},
            {"_id": 0}
        )

    driver_doc   = None
    driver_name  = ""
    driver_phone = ""
    bus_no       = ""

    if route_doc:
        bus_no = route_doc.get("bus_no", "") or route_doc.get("busNo", "")
        driver_doc = drivers.find_one(
            {"route": {"$regex": f"^{re.escape(student_route)}$", "$options": "i"}},
            {"_id": 0}
        )
        if driver_doc:
            driver_name  = driver_doc.get("name",  "")
            driver_phone = driver_doc.get("phone", "")

    # Parse stages/stops
    stops = []
    if route_doc:
        raw_stages = route_doc.get("stages", route_doc.get("stops", ""))
        if isinstance(raw_stages, str) and raw_stages:
            stops = [s.strip() for s in raw_stages.split(",") if s.strip()]
        elif isinstance(raw_stages, list):
            stops = raw_stages

    if not bus_no:
        bus_no = student.get("busNo", "")

    return {
        "name":       student.get("name", ""),
        "className":  student.get("className", ""),
        "rollNo":     student.get("rollNo", ""),
        "email":      student.get("email", ""),
        "route":      student_route,
        "stage":      student.get("stage", ""),
        "busNo":      bus_no,
        "driverName": driver_name,
        "driverNo":   driver_phone,
        "stops":      stops,
    }


# ══════════════════════════════════════════
# LOCATIONS — REST fallback for student map
# ✅ FIX: Reads from shared locations collection
# (same one the driver backend writes to)
# ══════════════════════════════════════════
@app.get("/locations/all")
async def get_all_locations():
    docs = list(locations.find({}))
    result = []
    for d in docs:
        d["_id"] = str(d["_id"])
        result.append({
            "driverId":   d.get("driverId", ""),
            "name":       d.get("name", ""),
            "busNo":      d.get("busNo", d.get("bus_no", "")),
            "route":      d.get("route", ""),
            "lat":        d.get("lat"),
            "lng":        d.get("lng"),
            "updated_at": d.get("updated_at", ""),
        })
    return result


# ══════════════════════════════════════════
# WEBSOCKET
# ✅ NOTE: Student MapPage.js connects directly to the
# DRIVER backend ws://localhost:8000/ws for live updates.
# This /ws endpoint here is kept for backward compatibility
# but is NOT used for live location delivery.
# ══════════════════════════════════════════
ws_clients = []

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    try:
        while True:
            await asyncio.sleep(30)
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        if ws in ws_clients:
            ws_clients.remove(ws)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
