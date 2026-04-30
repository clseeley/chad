import { type FormEvent, useEffect, useState } from "react";
import client from "../api/client";
import { useAuth } from "../auth/AuthContext";
import StravaConnectButton from "../components/StravaConnectButton";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [stravaConnected, setStravaConnected] = useState(false);
  const [phone, setPhone] = useState(user?.phone || "");
  const [timezone, setTimezone] = useState(user?.timezone || "America/New_York");
  const [notificationHour, setNotificationHour] = useState(
    user?.notification_hour ?? 7
  );
  const [units, setUnits] = useState(user?.units || "imperial");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    client.get("/strava/status").then(({ data }) => {
      setStravaConnected(data.connected);
    });
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    await client.put("/users/me", {
      phone: phone || null,
      timezone,
      notification_hour: notificationHour,
      units,
    });
    await refreshUser();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="page">
      <h2>Settings</h2>

      <div className="settings-section">
        <h3>Strava</h3>
        <StravaConnectButton
          connected={stravaConnected}
          onDisconnect={() => setStravaConnected(false)}
        />
      </div>

      <div className="settings-section">
        <h3>Profile</h3>
        <form onSubmit={handleSave} className="settings-form">
          <label>
            Phone (for SMS coaching)
            <input
              type="tel"
              placeholder="+14155551234"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>

          <label>
            Timezone
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="America/New_York">Eastern</option>
              <option value="America/Chicago">Central</option>
              <option value="America/Denver">Mountain</option>
              <option value="America/Los_Angeles">Pacific</option>
              <option value="America/Anchorage">Alaska</option>
              <option value="Pacific/Honolulu">Hawaii</option>
            </select>
          </label>

          <label>
            Daily workout text time
            <select
              value={notificationHour}
              onChange={(e) => setNotificationHour(Number(e.target.value))}
            >
              {Array.from({ length: 14 }, (_, i) => i + 5).map((h) => (
                <option key={h} value={h}>
                  {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                </option>
              ))}
            </select>
          </label>

          <label>
            Units
            <select value={units} onChange={(e) => setUnits(e.target.value)}>
              <option value="imperial">Imperial (mi, lbs)</option>
              <option value="metric">Metric (km, kg)</option>
            </select>
          </label>

          <button type="submit" className="btn-primary">
            {saved ? "Saved" : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
