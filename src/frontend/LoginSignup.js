import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginSignup.css";

const API = "https://backendstudent-1.onrender.com";

// ✅ Fetch with 8-second timeout — prevents infinite "Registering..."
async function fetchWithTimeout(url, options, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Is the backend running on port 8000?");
    }
    throw new Error("Server not reachable. Is the backend running on port 8000?");
  } finally {
    clearTimeout(timer);
  }
}

export default function LoginSignup() {
  const [isLogin, setIsLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "", password: "", stage: "", className: "", rollNo: ""
  });

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  // ── Register ──
  const handleRegister = async () => {
    if (!form.name || !form.password || !form.rollNo || !form.stage || !form.className) {
      alert("Please fill all fields ⚠️");
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:      form.name,
          password:  form.password,
          stage:     form.stage,
          className: form.className,
          rollNo:    form.rollNo,
        })
      });

      const data = await res.json();

      if (data.error) {
        alert("❌ " + data.error);
        return;
      }

      alert("Registered Successfully ✅\nYou can now login.\n\n⚠️ Your route will be assigned by the admin.");
      setIsLogin(true);

    } catch (err) {
      alert("❌ " + err.message);
    } finally {
      setLoading(false); // ✅ Always resets — button never stays stuck
    }
  };

  // ── Login ──
  const handleLogin = async () => {
    if (!form.rollNo || !form.password) {
      alert("Enter Roll No and Password ⚠️");
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rollNo: form.rollNo, password: form.password })
      });

      const data = await res.json();

      if (data.error) {
        alert("❌ " + data.error);
        return;
      }

      localStorage.setItem("student", JSON.stringify(data));
      navigate("/dashboard");

    } catch (err) {
      alert("❌ " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card">

        {/* Header */}
        <div className="app-header">
          <div className="app-bus-icon">🚌</div>
          <div className="app-title">College Bus Tracking</div>
          <div className="app-sub">Student Portal</div>
        </div>

        {/* Toggle */}
        <div className="toggle">
          <button className={!isLogin ? "active" : "inactive"} onClick={() => setIsLogin(false)}>
            Register
          </button>
          <button className={isLogin ? "active" : "inactive"} onClick={() => setIsLogin(true)}>
            Login
          </button>
        </div>

        {/* Register Form */}
        {!isLogin ? (
          <>
            <h2>Create Account</h2>
            <input placeholder="Full Name"                 value={form.name}      onChange={update("name")} />
            <input placeholder="Roll No"                   value={form.rollNo}    onChange={update("rollNo")} />
            <input placeholder="Class (e.g. 3rd Year BCA)" value={form.className} onChange={update("className")} />
            <input placeholder="Your Stage / Stop Name"    value={form.stage}     onChange={update("stage")} />
            <input placeholder="Password" type="password"  value={form.password}  onChange={update("password")} />

            <div className="note">
              ℹ️ Your bus route will be assigned by the admin after registration.
            </div>

            <button className="btn" onClick={handleRegister} disabled={loading}>
              {loading ? "Registering..." : "Register"}
            </button>
            <p className="bottom-text">
              Already registered? <span onClick={() => setIsLogin(true)}>Login here</span>
            </p>
          </>
        ) : (
          <>
            <h2>Student Login</h2>
            <input placeholder="Roll No"  value={form.rollNo}  onChange={update("rollNo")} />
            <input placeholder="Password" type="password" value={form.password} onChange={update("password")} />
            <button className="btn" onClick={handleLogin} disabled={loading}>
              {loading ? "Logging in..." : "Login →"}
            </button>
            <p className="bottom-text">
              New student? <span onClick={() => setIsLogin(false)}>Register here</span>
            </p>
          </>
        )}

      </div>
    </div>
  );
}