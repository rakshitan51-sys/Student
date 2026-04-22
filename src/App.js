import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import React from "react";
import LoginSignup from "./frontend/LoginSignup";
import StudentDashboard from "./frontend/StudentDashboard";
import MapPage from "./frontend/MapPage";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"          element={<LoginSignup />} />
        <Route path="/dashboard" element={<StudentDashboard />} />
        <Route path="/map"       element={<MapPage />} />
      </Routes>
    </Router>
  );
}

export default App;