import { useState } from "react";
import client from "../api/client";

export default function StravaConnectButton({
  connected,
  onDisconnect,
}: {
  connected: boolean;
  onDisconnect: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const { data } = await client.get("/strava/connect");
      window.location.href = data.authorization_url;
    } catch {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await client.delete("/strava/disconnect");
      onDisconnect();
    } finally {
      setLoading(false);
    }
  };

  if (connected) {
    return (
      <div className="strava-status">
        <span className="strava-connected">Connected to Strava</span>
        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="btn-outline btn-sm"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="btn-strava"
    >
      {loading ? "Connecting..." : "Connect with Strava"}
    </button>
  );
}
